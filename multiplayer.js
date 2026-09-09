/* ==========================================
   multiplayer.js — PeerJSを使ったP2Pマルチプレイヤー(複数人対応)
   星型(ホスト中継)トポロジー: ホストは全参加者と直接つながり、参加者同士は
   繋がらずホストが中継する。フルメッシュより接続数が少なく、ホストが
   ランキングを一元管理できるため、複数人対応の実装として単純で頑丈。

   ※WebRTC自体は同一LANである必要はなく、インターネット越しに直接つながる。
   ただし接続を確立するまでの仲介(シグナリング)にPeerJSのクラウドサーバーが
   必要で、この仲介サーバーとの通信だけはインターネット接続が要る
   (file://での起動自体は引き続き可能)。

   通信プロトコル(すべてJSONで送る):
   参加者→ホスト:
     { type:'hello', name }                      接続直後の名乗り
     { type:'progress', score, correct, combo }   プレイ中の進捗(間引いて送信)
     { type:'finished', score, wpm, acc }         終了時の最終結果
     { type:'ping' } / { type:'pong' }            生存確認(自動切断検知用)
   ホスト→参加者(1人 or 全員):
     { type:'hello_ack', accepted, reason, id }   名前確定の可否
     { type:'roster', participants:[{id,name}], hostName, allowLateJoin }
     { type:'start', isCjk, mode, targetValue, questions, roundNo }
     { type:'leaderboard', entries:[{id,name,score,rank}] }
     { type:'round_over', entries:[{id,name,score,rank}], reason }
     { type:'kicked' }
     { type:'ping' } / { type:'pong' }
========================================== */

let mpMode = null;           // null | 'host' | 'join'
let mpIsMultiplayer = false; // 現在進行中/直前のプレイがマルチプレイかどうか
let mpPeer = null;
let mpMyId = '';             // 自分の参加者ID(ホストは'host'固定、参加者はPeerJSのID)
let mpMyName = '';
let mpRoomCode = '';
let mpMessageHandler = null;
let mpLastProgressSentAt = 0;
let mpRoundNo = 0;
let mpAllowLateJoin = false;
let mpLastLeaderboard = [];  // 直近に受け取った(またはホストなら計算した)順位表
let mpIsRoundActive = false; // [ホスト専用] 現在ホストしているラウンドが進行中かどうか(途中参加の可否判定に使う)

// ホスト専用の状態
let mpHostConns = [];        // [{ id, name, conn, lastSeen, score, finished }]

const MP_ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MP_PEER_PREFIX = 'tmpro-';
const MP_MAX_PARTICIPANTS = 8; // ホスト含む上限(P2Pなので程々に)
const MP_HEARTBEAT_MS = 5000;
const MP_HEARTBEAT_TIMEOUT_MS = 15000;

function mpGenerateRoomCode() {
    let code = '';
    for (let i = 0; i < 8; i++) code += MP_ROOM_CODE_CHARS[Math.floor(Math.random() * MP_ROOM_CODE_CHARS.length)];
    return code;
}

// ★8文字の英数字コードはランダム生成するが、入力側はShiftミスなどで大文字小文字が
// 揺れうるため、PeerJSのpeer id自体は常に小文字に正規化してから使う
// (表示上はユーザーには大文字で見せる)。
function mpNormalizeCode(code) {
    return (code || '').trim().toLowerCase();
}

function mpSetMessageHandler(fn) { mpMessageHandler = fn; }

function mpTeardown() {
    mpHostConns.forEach(p => { try { p.conn.close(); } catch(e) {} });
    mpHostConns = [];
    if (mpPeer) { try { mpPeer.destroy(); } catch(e) {} mpPeer = null; }
    mpMode = null; mpIsMultiplayer = false; mpIsRoundActive = false;
    mpMyId = ''; mpMyName = ''; mpRoomCode = '';
    mpRoundNo = 0; mpAllowLateJoin = false; mpLastLeaderboard = [];
    document.body.classList.remove('mp-active');
}

/* ============ ランキング計算(同率順位対応: 1224方式) ============ */
function mpComputeRanking(entries) {
    const sorted = [...entries].sort((a, b) => b.score - a.score);
    let rank = 0, prevScore = null, seen = 0;
    return sorted.map(e => {
        seen++;
        if (e.score !== prevScore) { rank = seen; prevScore = e.score; }
        return { ...e, rank };
    });
}

/* ==================== ホスト側 ==================== */

// ホストとしてセッションを開始する。PeerJSのID衝突(unavailable-id)時は
// コードを振り直して自動リトライする。
function mpHost(name, onCodeReady, onRosterChange, onError, attempt) {
    attempt = attempt || 0;
    mpMode = 'host'; mpMyName = name; mpMyId = 'host';
    const code = mpGenerateRoomCode();
    mpRoomCode = code;

    let peer;
    try {
        peer = new Peer(MP_PEER_PREFIX + mpNormalizeCode(code));
    } catch(e) { if (onError) onError(e); return; }

    peer.on('open', () => {
        mpPeer = peer;
        if (onCodeReady) onCodeReady(code);
        mpStartHeartbeat(onRosterChange);
    });

    peer.on('connection', (conn) => {
        conn.on('open', () => {
            conn.on('data', (data) => mpHostHandleData(conn, data, onRosterChange));
            conn.on('close', () => mpHostRemoveParticipant(conn.peer, onRosterChange, 'left'));
        });
    });

    peer.on('error', (err) => {
        if (err && err.type === 'unavailable-id' && attempt < 5) {
            mpHost(name, onCodeReady, onRosterChange, onError, attempt + 1);
            return;
        }
        if (onError) onError(err);
    });
}

function mpHostHandleData(conn, data, onRosterChange) {
    if (data.type === 'hello') {
        mpHostHandleHello(conn, data.name, onRosterChange);
    } else if (data.type === 'progress') {
        const p = mpHostConns.find(p => p.id === conn.peer);
        if (p) { p.score = data.score; mpHostBroadcastLeaderboard(); }
    } else if (data.type === 'finished') {
        const p = mpHostConns.find(p => p.id === conn.peer);
        if (p) { p.score = data.score; p.finished = true; mpHostBroadcastLeaderboard(); }
    } else if (data.type === 'pong' || data.type === 'ping') {
        const p = mpHostConns.find(p => p.id === conn.peer);
        if (p) p.lastSeen = Date.now();
        if (data.type === 'ping') { try { conn.send({ type: 'pong' }); } catch(e) {} }
    }
    if (mpMessageHandler) mpMessageHandler(data, conn.peer);
}

function mpHostHandleHello(conn, name, onRosterChange) {
    const trimmed = (name || '').trim();
    const duplicate = mpHostConns.some(p => p.name.toLowerCase() === trimmed.toLowerCase()) || trimmed.toLowerCase() === mpMyName.toLowerCase();
    const full = mpHostConns.length + 1 >= MP_MAX_PARTICIPANTS;

    if (duplicate) { try { conn.send({ type: 'hello_ack', accepted: false, reason: 'duplicate_name' }); } catch(e) {} try { conn.close(); } catch(e) {} return; }
    if (full) { try { conn.send({ type: 'hello_ack', accepted: false, reason: 'room_full' }); } catch(e) {} try { conn.close(); } catch(e) {} return; }

    mpHostConns.push({ id: conn.peer, name: trimmed, conn, lastSeen: Date.now(), score: 0, finished: false });
    try { conn.send({ type: 'hello_ack', accepted: true, id: conn.peer }); } catch(e) {}

    // ★途中参加が許可されていて、かつ今まさにラウンド進行中なら即座に合流させる。
    // 許可されていない場合は接続だけ受け入れ、今のラウンドが終わって
    // 「続ける」で次のラウンドが始まった時に自動的に参加者として含まれる。
    if (mpIsRoundActive && mpAllowLateJoin && mpCurrentRoundData) {
        try { conn.send({ type: 'start', ...mpCurrentRoundData, roundNo: mpRoundNo }); } catch(e) {}
    }

    mpHostBroadcastRoster();
    if (onRosterChange) onRosterChange();
}

function mpHostRemoveParticipant(id, onRosterChange, reason) {
    const idx = mpHostConns.findIndex(p => p.id === id);
    if (idx === -1) return;
    mpHostConns.splice(idx, 1);
    mpHostBroadcastRoster();
    if (onRosterChange) onRosterChange(reason);

    // ★ホスト以外の全員が退出した場合は、その時点でラウンドを終了扱いにする
    if (mpIsRoundActive && mpHostConns.length === 0) {
        mpHostEndRound('all_left');
    }
}

function mpHostKick(id) {
    const p = mpHostConns.find(p => p.id === id);
    if (!p) return;
    try { p.conn.send({ type: 'kicked' }); } catch(e) {}
    try { p.conn.close(); } catch(e) {}
    mpHostRemoveParticipant(id, null, 'kicked');
}

function mpHostBroadcastRoster() {
    const participants = mpHostConns.map(p => ({ id: p.id, name: p.name }));
    const payload = { type: 'roster', participants, hostName: mpMyName, allowLateJoin: mpAllowLateJoin };
    mpHostConns.forEach(p => { try { p.conn.send(payload); } catch(e) {} });
    if (mpMessageHandler) mpMessageHandler(payload, 'host');
}

function mpHostBroadcastLeaderboard() {
    const entries = [{ id: 'host', name: mpMyName, score: (typeof stats !== 'undefined' && stats) ? stats.score : 0 }]
        .concat(mpHostConns.map(p => ({ id: p.id, name: p.name, score: p.score })));
    mpLastLeaderboard = mpComputeRanking(entries);
    const payload = { type: 'leaderboard', entries: mpLastLeaderboard };
    mpHostConns.forEach(p => { try { p.conn.send(payload); } catch(e) {} });
    mpUpdateLeaderboardUI();
}

let mpCurrentRoundData = null;

// ホストが新しいラウンドを開始する。今接続している全員(遅れて参加した人含む)に送る。
function mpHostStartRound(isCjk, mode, targetValue, questions, allowLateJoin) {
    mpRoundNo++;
    mpAllowLateJoin = !!allowLateJoin;
    mpIsRoundActive = true;
    mpCurrentRoundData = { isCjk, mode, targetValue, questions };
    mpHostConns.forEach(p => { p.score = 0; p.finished = false; });
    const payload = { type: 'start', isCjk, mode, targetValue, questions, roundNo: mpRoundNo };
    mpHostConns.forEach(p => { try { p.conn.send(payload); } catch(e) {} });
    mpHostBroadcastLeaderboard();
}

function mpHostEndRound(reason) {
    mpIsRoundActive = false;
    const payload = { type: 'round_over', entries: mpLastLeaderboard, reason: reason || 'finished' };
    mpHostConns.forEach(p => { try { p.conn.send(payload); } catch(e) {} });
    if (mpMessageHandler) mpMessageHandler(payload, 'host');
}

/* ==================== 参加者側 ==================== */

function mpJoin(code, name, onConnected, onRejected, onError) {
    mpMode = 'join'; mpMyName = name; mpRoomCode = code;
    let peer;
    try { peer = new Peer(); } catch(e) { if (onError) onError(e); return; }

    peer.on('open', (id) => {
        mpPeer = peer; mpMyId = id;
        const conn = peer.connect(MP_PEER_PREFIX + mpNormalizeCode(code), { reliable: true });
        conn.on('open', () => { conn.send({ type: 'hello', name: mpMyName }); });
        conn.on('data', (data) => mpJoinHandleData(conn, data, onConnected, onRejected));
        conn.on('close', () => { if (mpMessageHandler) mpMessageHandler({ type: 'host_disconnected' }, 'host'); });
        conn.on('error', (err) => { if (onError) onError(err); });
        mpPeer._mpHostConn = conn;
    });
    peer.on('error', (err) => { if (onError) onError(err); });
}

function mpJoinHandleData(conn, data, onConnected, onRejected) {
    if (data.type === 'hello_ack') {
        if (!data.accepted) { if (onRejected) onRejected(data.reason); try { conn.close(); } catch(e) {} return; }
        if (onConnected) onConnected();
    } else if (data.type === 'ping') {
        try { conn.send({ type: 'pong' }); } catch(e) {}
    } else if (data.type === 'leaderboard') {
        mpLastLeaderboard = data.entries;
        mpUpdateLeaderboardUI();
    }
    if (mpMessageHandler) mpMessageHandler(data, 'host');
}

// 参加者→ホストへの送信(接続はhost connectでpeer._mpHostConnに保持している)
function mpSendToHost(data) {
    const conn = mpPeer && mpPeer._mpHostConn;
    if (conn && conn.open) conn.send(data);
}

/* ==================== 生存確認(自動切断検知) ====================
   PeerJSの'close'イベントは、タブが正常終了した場合等は発火するが、
   ネットワーク切断のように片方が突然いなくなるケースでは発火が遅れたり
   しないことがある。一定間隔でping/pongを送り合い、応答が一定時間無い
   相手を「切断した」とみなして能動的に処理する。 */
let mpHeartbeatIv = null;
function mpStartHeartbeat(onRosterChange) {
    if (mpHeartbeatIv) clearInterval(mpHeartbeatIv);
    mpHeartbeatIv = setInterval(() => {
        if (mpMode === 'host') {
            const now = Date.now();
            mpHostConns.forEach(p => { try { p.conn.send({ type: 'ping' }); } catch(e) {} });
            const stale = mpHostConns.filter(p => now - p.lastSeen > MP_HEARTBEAT_TIMEOUT_MS);
            stale.forEach(p => mpHostRemoveParticipant(p.id, onRosterChange, 'timeout'));
        } else if (mpMode === 'join') {
            mpSendToHost({ type: 'ping' });
        }
    }, MP_HEARTBEAT_MS);
}

/* ==================== 進捗送信・UI反映(共通) ==================== */

// プレイ中の進捗共有。フラッディング防止のため間引く。
// (isPlayingでなければそもそもaddScore()経由でここに来ないため、活動状態の
// チェックはgame.js側のisPlayingガードに任せている)
function mpMaybeSendProgress() {
    if (!mpIsMultiplayer) return;
    const now = performance.now();
    if (now - mpLastProgressSentAt < 300) return;
    mpLastProgressSentAt = now;
    if (mpMode === 'host') {
        mpHostBroadcastLeaderboard();
    } else {
        mpSendToHost({ type: 'progress', score: stats.score, correct: stats.correct, combo: stats.combo });
    }
}

function mpSendFinished(wpm, acc) {
    if (!mpIsMultiplayer) return;
    if (mpMode === 'host') {
        mpHostBroadcastLeaderboard();
    } else {
        mpSendToHost({ type: 'finished', score: stats.score, wpm: wpm || 0, acc: acc || '' });
    }
}

// プレイ中のHUDに出す簡易リーダーボード(全参加者の現在スコアを順位順に表示)
function mpUpdateLeaderboardUI() {
    const el = document.getElementById('mp-live-leaderboard');
    if (!el || !mpLastLeaderboard.length) return;
    let html = '';
    mpLastLeaderboard.forEach(e => {
        const isMe = e.id === mpMyId;
        html += `<div class="mp-lb-row${isMe ? ' mp-lb-me' : ''}"><span class="mp-lb-rank">#${e.rank}</span><span class="mp-lb-name">${e.name}</span><span class="mp-lb-score">${e.score.toLocaleString()}</span></div>`;
    });
    el.innerHTML = html;
}
