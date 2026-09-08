/* ==========================================
   multiplayer.js — PeerJSを使ったP2Pマルチプレイヤー
   実際の対戦データ(WebRTC data channel)自体はブラウザ間の直接通信だが、
   その接続を確立するためにPeerJSのシグナリングサーバー(クラウド)が必要で、
   これだけはインターネット接続が無いと動かない。シングルプレイは
   引き続き完全オフライン(file://)で動作する。

   通信プロトコル(すべてJSONで送る):
   { type: 'hello',      name }                                  接続直後の名乗り
   { type: 'start',      isCjk, mode, targetValue, questions, hostName }  ホスト→参加者への開始合図
   { type: 'progress',   score, correct, combo }                 プレイ中の進捗(間引いて送信)
   { type: 'finished',   name, score, wpm, acc }                 終了時の最終結果
   { type: 'disconnect' }                                        (相手にではなく自分の切断検知時にローカルで生成)
========================================== */

let mpMode = null;          // null | 'host' | 'join'
let mpIsMultiplayer = false; // 現在進行中/直前のプレイがマルチプレイかどうか
let mpPeer = null;
let mpConn = null;
let mpMyName = '';
let mpOpponentName = '';
let mpRoomCode = '';
let mpMessageHandler = null;
let mpOpponentFinalStats = null;
let mpLastProgressSentAt = 0;

const MP_ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MP_PEER_PREFIX = 'tmpro-';

function mpGenerateRoomCode() {
    let code = '';
    for (let i = 0; i < 8; i++) code += MP_ROOM_CODE_CHARS[Math.floor(Math.random() * MP_ROOM_CODE_CHARS.length)];
    return code;
}

// ★8文字の英数字コードは「なるべく重ならないように」ランダム生成するが、
// 入力側はShiftミスなどで大文字小文字が揺れうるため、PeerJSのpeer id自体は
// 常に小文字に正規化してから使う(表示上はユーザーには大文字で見せる)。
function mpNormalizeCode(code) {
    return (code || '').trim().toLowerCase();
}

function mpSetMessageHandler(fn) { mpMessageHandler = fn; }

function mpSend(data) {
    if (mpConn && mpConn.open) mpConn.send(data);
}

function mpTeardown() {
    if (mpConn) { try { mpConn.close(); } catch(e) {} mpConn = null; }
    if (mpPeer) { try { mpPeer.destroy(); } catch(e) {} mpPeer = null; }
    mpMode = null; mpIsMultiplayer = false;
    mpMyName = ''; mpOpponentName = ''; mpRoomCode = '';
    mpOpponentFinalStats = null;
    document.body.classList.remove('mp-active');
}

function mpBindConnectionEvents(conn, onOpponentNamed) {
    conn.on('data', (data) => {
        if (data.type === 'hello') {
            mpOpponentName = data.name;
            if (onOpponentNamed) onOpponentNamed(data.name);
        }
        if (mpMessageHandler) mpMessageHandler(data);
    });
    conn.on('close', () => { if (mpMessageHandler) mpMessageHandler({ type: 'disconnect' }); });
}

// ホストとしてセッションを開始する。PeerJSのopenイベントでコードが確定した
// 時点でonCodeReadyを、相手が名乗ってきた時点でonOpponentJoinedを呼ぶ。
function mpHost(name, onCodeReady, onOpponentJoined, onError) {
    mpMode = 'host'; mpMyName = name;
    const code = mpGenerateRoomCode();
    mpRoomCode = code;
    try {
        mpPeer = new Peer(MP_PEER_PREFIX + mpNormalizeCode(code));
    } catch(e) { if (onError) onError(e); return; }

    mpPeer.on('open', () => { if (onCodeReady) onCodeReady(code); });
    mpPeer.on('connection', (conn) => {
        mpConn = conn;
        conn.on('open', () => { conn.send({ type: 'hello', name: mpMyName }); });
        mpBindConnectionEvents(conn, onOpponentJoined);
    });
    mpPeer.on('error', (err) => { if (onError) onError(err); });
}

// 参加者としてホストへ接続する。
function mpJoin(code, name, onConnected, onError) {
    mpMode = 'join'; mpMyName = name; mpRoomCode = code;
    try {
        mpPeer = new Peer();
    } catch(e) { if (onError) onError(e); return; }

    mpPeer.on('open', () => {
        mpConn = mpPeer.connect(MP_PEER_PREFIX + mpNormalizeCode(code), { reliable: true });
        mpConn.on('open', () => { mpConn.send({ type: 'hello', name: mpMyName }); });
        mpBindConnectionEvents(mpConn, onConnected);
        mpConn.on('error', (err) => { if (onError) onError(err); });
    });
    mpPeer.on('error', (err) => { if (onError) onError(err); });
}

// プレイ中の進捗共有。フラッディング防止のため間引く。
function mpMaybeSendProgress() {
    if (!mpIsMultiplayer) return;
    const now = performance.now();
    if (now - mpLastProgressSentAt < 300) return;
    mpLastProgressSentAt = now;
    mpSend({ type: 'progress', score: stats.score, correct: stats.correct, combo: stats.combo });
}

function mpUpdateOpponentProgress(data) {
    const el = document.getElementById('mp-opponent-score');
    if (el) el.innerText = data.score.toLocaleString();
}

function mpShowOpponentResult(data) {
    mpOpponentFinalStats = data;
    const el = document.getElementById('mp-opponent-result');
    if (!el) return;
    el.classList.remove('hidden');
    document.getElementById('mp-opponent-result-name').innerText = data.name;
    document.getElementById('mp-opponent-result-score').innerText = data.score.toLocaleString();
    document.getElementById('mp-opponent-result-wpm').innerText = data.wpm;
}
