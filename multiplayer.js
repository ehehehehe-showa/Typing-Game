/* ==========================================
   multiplayer.js — PeerJSを使ったP2Pマルチプレイヤー(複数人対応)

   用語: ホストが作成し、参加者がその中に入っている塊を「ルーム」と呼ぶ。
   ルームは1つのPeerJS接続(ホスト)を中心に、参加者が出入りしながら
   何ラウンドでも続けられる(「続ける」で同じルームのまま次のラウンドへ)。

   星型(ホスト中継)トポロジー: ホストは全参加者と直接つながり、参加者同士は
   繋がらずホストが中継する。フルメッシュより接続数が少なく、ホストが
   ランキングを一元管理できるため、複数人対応の実装として単純で頑丈。

   ※WebRTC自体は同一LANである必要はなく、インターネット越しに直接つながる。
   ただし接続を確立するまでの仲介(シグナリング)にPeerJSのクラウドサーバーが
   必要で、この仲介サーバーとの通信だけはインターネット接続が要る。
   ※NAT越えのためGoogle/Twilioなど複数の公開STUNサーバーを設定しているが、
   これはあくまで「双方の公開IP/ポートを教え合う」ためのものであり、
   TURN(中継)サーバーは含んでいない。回線によっては(特に厳しめの
   企業・大学ネットワークや一部のモバイル回線)STUNだけでは直接経路が
   見つからず接続できないことがある。その場合はTURNサーバーの追加が必要。

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
let mpRoomActive = false;    // ルーム(ホストのPeerJS接続)自体が今開いているかどうか。
                              // 「続ける」で同じルームのまま複数ラウンドをこなすため、
                              // ラウンドの開始/終了(mpIsRoundActive寄りの概念)とは別に管理する。
let mpPeer = null;
let mpMyId = '';             // 自分の参加者ID(ホストは'host'固定、参加者はPeerJSのID)
let mpMyName = '';
let mpRoomCode = '';
let mpMessageHandler = null;
let mpLastProgressSentAt = 0;
let mpRoundNo = 0;
let mpAllowLateJoin = false;
let mpLastLeaderboard = [];  // 直近に受け取った(またはホストなら計算した)順位表
let mpLastParticipantCount = 0; // ホスト含む現在の人数(roster/leaderboardどちらでも更新)
let mpIsRoundActive = false; // [ホスト専用] 現在ラウンドが進行中かどうか(途中参加の可否判定に使う)
let mpJoinConfirmed = false; // [参加者専用] hello_ackで正式にルームへ受理されたかどうか

// ホスト専用の状態
let mpHostConns = [];        // [{ id, name, conn, lastSeen, score, finished }]

const MP_ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MP_PEER_PREFIX = 'tmpro-';
const MP_MAX_PARTICIPANTS = 8; // ホスト含む上限(P2Pなので程々に)
const MP_HEARTBEAT_MS = 5000;
// ★モバイルブラウザ(特にiOS Safari)はバックグラウンドタブのJS実行を
// 大きく間引く/一時停止することがあり、以前の15秒は「タブを見ていないだけ」の
// 参加者まで誤ってタイムアウト扱いにしてしまっていた。実際の切断検知としては
// 少し長めだが、猶予を優先して30秒に伸ばしている。
const MP_HEARTBEAT_TIMEOUT_MS = 30000;

// NAT越えの成功率を上げるため、複数の公開STUNサーバーを設定する
// (前回はPeerJSの初期設定任せだったが、同一Wi-Fi内でも接続できないケースがあったため)
const MP_ICE_CONFIG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
    ]
};

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

// 現在の人数(ホスト含む)を常に取得できるようにするヘルパー。
// roster(待機中)・leaderboard(ラウンド中)どちらの更新でもmpLastParticipantCountを
// 最新に保っているので、どのタイミングで見ても正確な人数が取れる。
function mpGetParticipantCount() {
    if (mpMode === 'host') return mpHostConns.length + 1;
    return mpLastParticipantCount;
}

function mpTeardown() {
    mpHostConns.forEach(p => { try { p.conn.close(); } catch(e) {} });
    mpHostConns = [];
    if (mpPeer) { try { mpPeer.destroy(); } catch(e) {} mpPeer = null; }
    mpMode = null; mpIsMultiplayer = false; mpIsRoundActive = false; mpRoomActive = false;
    mpMyId = ''; mpMyName = ''; mpRoomCode = ''; mpJoinConfirmed = false;
    mpRoundNo = 0; mpAllowLateJoin = false; mpLastLeaderboard = []; mpLastParticipantCount = 0;
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

// ルームを作成する(ホストになる)。PeerJSのID衝突(unavailable-id)時は
// コードを振り直して自動リトライする。
function mpHost(name, onCodeReady, onRosterChange, onError, attempt) {
    attempt = attempt || 0;
    mpMode = 'host'; mpMyName = name; mpMyId = 'host';
    const code = mpGenerateRoomCode();
    mpRoomCode = code;

    let peer;
    try {
        peer = new Peer(MP_PEER_PREFIX + mpNormalizeCode(code), { config: MP_ICE_CONFIG });
    } catch(e) { if (onError) onError(e); return; }

    peer.on('open', () => {
        mpPeer = peer; mpRoomActive = true;
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

function mpHostTimeoutParticipant(p, onRosterChange) {
    // ★iPad等でタブがバックグラウンドになると、参加者側のJS実行自体が
    // 一時停止され、ハートビート(ping)に応答できなくなることがある。
    // この場合、接続そのものはまだ生きていることが多いため、切断する前に
    // 「タイムアウトで退出させた」ことを伝えるメッセージを送っておく。
    // 参加者のタブがスリープから復帰した際にこのメッセージ(WebRTCの
    // データチャネル上でキューされて届くことが多い)を受け取れれば、
    // 「キックもされず、続けている判定のまま良く分からない状態になる」
    // という不具合を避けられる。
    try { p.conn.send({ type: 'removed', reason: 'timeout' }); } catch(e) {}
    try { p.conn.close(); } catch(e) {}
    mpHostRemoveParticipant(p.id, onRosterChange, 'timeout');
}

function mpHostRemoveParticipant(id, onRosterChange, reason) {
    const idx = mpHostConns.findIndex(p => p.id === id);
    if (idx === -1) return;
    mpHostConns.splice(idx, 1);
    mpHostBroadcastRoster();
    if (onRosterChange) onRosterChange(reason);

    // ★途中で抜けた参加者がランキングに残り続けないよう、退出のたびに
    // 順位表を再計算して即座に配り直す(スコア更新が無いと古いまま残っていたバグ)
    if (mpIsRoundActive) mpHostBroadcastLeaderboard();

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
    // ★退出済みの参加者はmpHostConnsから既に消えているため、ここで組み立て直す
    // 限りランキングに残り続けることはない
    const entries = [{ id: 'host', name: mpMyName, score: (typeof stats !== 'undefined' && stats) ? stats.score : 0 }]
        .concat(mpHostConns.map(p => ({ id: p.id, name: p.name, score: p.score })));
    mpLastLeaderboard = mpComputeRanking(entries);
    const payload = { type: 'leaderboard', entries: mpLastLeaderboard };
    mpHostConns.forEach(p => { try { p.conn.send(payload); } catch(e) {} });
    mpUpdateLeaderboardUI();
}

let mpCurrentRoundData = null;

// ホストが(同じルームのまま)新しいラウンドを開始する。
// 今接続している全員(遅れて参加した人含む)に送る。
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
    mpMode = 'join'; mpMyName = name; mpRoomCode = code; mpJoinConfirmed = false;
    let peer;
    try { peer = new Peer({ config: MP_ICE_CONFIG }); } catch(e) { if (onError) onError(e); return; }

    peer.on('open', (id) => {
        mpPeer = peer; mpMyId = id;
        const conn = peer.connect(MP_PEER_PREFIX + mpNormalizeCode(code), { reliable: true });
        mpPeer._mpHostConn = conn;

        // ★接続確立自体がタイムアウトした場合(相手が存在しない/経路が無い等)、
        // PeerJSのconn.on('open')もconn.on('error')も発火しないまま無反応になる
        // ことがあるため、一定時間で見切りをつけて明示的にエラーとして扱う。
        const connectTimeout = setTimeout(() => {
            if (!mpJoinConfirmed) { if (onError) onError(new Error('connection-timeout')); }
        }, 15000);

        conn.on('open', () => { conn.send({ type: 'hello', name: mpMyName }); });
        conn.on('data', (data) => { clearTimeout(connectTimeout); mpJoinHandleData(conn, data, onConnected, onRejected); });
        conn.on('close', () => {
            // ★hello_ackで正式に受理される前の切断は「接続失敗」であって
            // 「ルームが終了した」わけではない。ここを区別しないと、参加を
            // 試みただけで(接続が一瞬で切れた場合に)いきなり試合終了扱いに
            // なってしまうバグがあった。
            if (mpJoinConfirmed) { if (mpMessageHandler) mpMessageHandler({ type: 'host_disconnected' }, 'host'); }
            else { if (onError) onError(new Error('connection-closed-before-join')); }
        });
        conn.on('error', (err) => { clearTimeout(connectTimeout); if (onError) onError(err); });
    });
    peer.on('error', (err) => { if (onError) onError(err); });
}

function mpJoinHandleData(conn, data, onConnected, onRejected) {
    if (data.type === 'hello_ack') {
        if (!data.accepted) { if (onRejected) onRejected(data.reason); try { conn.close(); } catch(e) {} return; }
        mpJoinConfirmed = true;
        if (onConnected) onConnected();
    } else if (data.type === 'ping') {
        try { conn.send({ type: 'pong' }); } catch(e) {}
    } else if (data.type === 'roster') {
        mpLastParticipantCount = data.participants.length + 1; // ホスト込み
    } else if (data.type === 'leaderboard') {
        mpLastLeaderboard = data.entries;
        mpLastParticipantCount = data.entries.length;
        mpUpdateLeaderboardUI();
    } else if (data.type === 'removed') {
        // ★タブがバックグラウンドで一時停止していた間にハートビート未応答で
        // タイムアウト退出させられていたケース。復帰後にこのメッセージを
        // 受け取れれば、キックもされず良く分からない状態のまま固まるのを防げる。
        mpJoinConfirmed = false;
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
            stale.forEach(p => mpHostTimeoutParticipant(p, onRosterChange));
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

    const countEl = document.getElementById('mp-hud-count');
    if (countEl) countEl.innerText = `${mpLastLeaderboard.length}`;
}

/* ==================== タブのバックグラウンド復帰時の再同期 ====================
   iPad/iOS Safari等はバックグラウンドタブのJS実行を大きく間引く/一時停止する。
   その間はping/pongが送れず、ホスト側からは無応答に見えて30秒後に
   タイムアウト退出させられることがある。visibilitychangeはこの一時停止中でも
   タブが表に戻った瞬間に確実に発火するため、これを使って即座に生存確認を
   送り直し、ハートビートの次回発火を待たずに復帰できるようにする。 */
try {
    document.addEventListener('visibilitychange', () => {
        try {
            if (document.hidden || !mpIsMultiplayer) return;
            if (mpMode === 'join') mpSendToHost({ type: 'ping' });
            else if (mpMode === 'host') mpHostConns.forEach(p => { try { p.conn.send({ type: 'ping' }); } catch(e) {} });
        } catch(e) { console.error('[multiplayer] visibilitychange処理中にエラー:', e); }
    });
} catch(e) { console.error('[multiplayer] visibilitychangeの登録に失敗しました:', e); }
