/* ==========================================
   screens/mode-select.js — 「シングル/マルチ」選択、マルチプレイの
   ホスト/参加フォーム、待機画面、ランキング画面の制御。
   実際のPeerJS通信はmultiplayer.js、ゲーム本編への合流はgame.jsの
   startMultiplayerRound()を呼ぶだけにしている。
========================================== */

function openModeSelect() {
    mpTeardown();
    updateMultiplayerAvailability();
    openScreen('mode-select-screen');
}

function selectSingleMode() {
    mpMode = null; mpIsMultiplayer = false;
    openScreen('play-select-screen'); renderQuestionSets(); initTagFilters();
}

function selectMultiMode() {
    if (!navigator.onLine) return; // オフライン時はボタン自体を無効化しているが念のため
    openScreen('mp-select-screen');
}

function openHostNameForm() {
    document.getElementById('mp-host-name-error').classList.add('hidden');
    openScreen('mp-host-name-screen');
}

function openJoinForm() {
    document.getElementById('mp-join-error').classList.add('hidden');
    openScreen('mp-join-screen');
}

function backFromPlaySelect() {
    if (mpMode === 'host') { openScreen('mp-host-name-screen'); }
    else { backToMain(); }
}

// ホスト: 名前を確定し、そのあとはシングルプレイと同じ画面(問題選択→設定)を使い回す
function submitHostName() {
    const name = document.getElementById('mp-host-name-input').value.trim();
    const errEl = document.getElementById('mp-host-name-error');
    if (name.length < 3) { errEl.innerText = t('mp_name_too_short'); errEl.classList.remove('hidden'); return; }
    errEl.classList.add('hidden');

    mpMyName = name; mpMode = 'host'; mpIsMultiplayer = true;
    openScreen('play-select-screen'); renderQuestionSets(); initTagFilters();
}

// 参加者: コードと名前を確定し、その場でホストへの接続を試みる
function submitJoinForm() {
    const code = document.getElementById('mp-join-code-input').value.trim();
    const name = document.getElementById('mp-join-name-input').value.trim();
    const errEl = document.getElementById('mp-join-error');
    if (!code) { errEl.innerText = t('mp_code_required'); errEl.classList.remove('hidden'); return; }
    if (name.length < 3) { errEl.innerText = t('mp_name_too_short'); errEl.classList.remove('hidden'); return; }
    errEl.classList.add('hidden');

    mpMode = 'join'; mpIsMultiplayer = true;
    document.getElementById('mp-waiting-title').innerText = t('mp_connecting');
    document.getElementById('mp-waiting-code-box').classList.add('hidden');
    document.getElementById('mp-waiting-participants').innerHTML = '';
    document.getElementById('mp-waiting-status').innerText = t('mp_connecting_status');
    openScreen('mp-waiting-screen');

    mpSetMessageHandler(handleMpMessage);
    mpJoin(code, name, () => {
        document.getElementById('mp-waiting-title').innerText = t('mp_waiting_host_round');
        document.getElementById('mp-waiting-status').innerText = t('mp_connected_waiting');
    }, (reason) => {
        const msg = reason === 'duplicate_name' ? t('mp_name_taken') : (reason === 'room_full' ? t('mp_room_full') : t('mp_connection_failed'));
        document.getElementById('mp-waiting-status').innerText = msg;
    }, (err) => {
        document.getElementById('mp-waiting-status').innerText = t('mp_connection_failed');
        console.error('[multiplayer] join error:', err);
    });
}

// ホスト: play-setupのSTARTボタンから呼ばれる。ここでコードを生成して待機画面へ。
function startHostingFlow() {
    const catId = selectedQSetId || questionSets[0].id;
    const set = questionSets.find(s => s.id === catId) || questionSets[0];

    let mode, target;
    if (set.forceSettings) { mode = set.forceSettings.mode; target = set.forceSettings.target; }
    else {
        mode = document.getElementById('play-mode').value;
        target = Math.min(9999, Math.max(1, parseInt(document.getElementById('play-value').value) || 60));
    }
    const isCjk = set.is_cjk !== false;
    const allowLateJoin = document.getElementById('mp-allow-late-join').checked;

    // 出題順をこの場で1回だけ確定し、参加者にそのまま送る(全員が全く同じ順番の問題で対戦する)
    const sharedQuestions = [...set.questions];
    shuffleArray(sharedQuestions);

    mpPendingRound = { isCjk, mode, target, questions: sharedQuestions, allowLateJoin };

    document.getElementById('mp-waiting-title').innerText = t('mp_hosting');
    document.getElementById('mp-waiting-code-box').classList.remove('hidden');
    document.getElementById('mp-room-code-text').innerText = '--------';
    document.getElementById('mp-waiting-status').innerText = t('mp_waiting_opponent');
    document.getElementById('mp-start-round-btn').classList.remove('hidden');
    renderMpParticipantList([]);
    openScreen('mp-waiting-screen');

    mpSetMessageHandler(handleMpMessage);
    mpHost(mpMyName, (code) => {
        document.getElementById('mp-room-code-text').innerText = code;
    }, () => {
        renderMpParticipantList(mpHostConns);
    }, (err) => {
        document.getElementById('mp-waiting-status').innerText = t('mp_connection_failed');
        console.error('[multiplayer] host error:', err);
    });
}

let mpPendingRound = null;

function mpHostStartRoundNow() {
    if (!mpPendingRound || mpHostConns.length === 0) return;
    mpHostStartRound(mpPendingRound.isCjk, mpPendingRound.mode, mpPendingRound.target, mpPendingRound.questions, mpPendingRound.allowLateJoin);
    startMultiplayerRound(mpPendingRound.isCjk, mpPendingRound.mode, mpPendingRound.target, mpPendingRound.questions);
}

function mpCopyRoomCode() {
    const code = document.getElementById('mp-room-code-text').innerText;
    if (!code || code === '--------') return;
    navigator.clipboard?.writeText(code).then(() => {
        const btn = document.getElementById('mp-copy-code-btn');
        if (!btn) return;
        const original = btn.innerText;
        btn.innerText = t('mp_copied');
        setTimeout(() => { btn.innerText = original; }, 1200);
    }).catch(() => {});
}

function renderMpParticipantList(list, hostNameOverride) {
    const showKick = mpMode === 'host';
    const el = document.getElementById('mp-waiting-participants');
    const countEl = document.getElementById('mp-participant-count');
    if (countEl) countEl.innerText = `${list.length + 1}`; // ホスト自身を含めた人数
    const startBtn = document.getElementById('mp-start-round-btn');
    if (startBtn) startBtn.disabled = list.length === 0;
    if (!el) return;
    const hostLabel = hostNameOverride || mpMyName;
    let html = `<div class="mp-participant-row mp-participant-host"><span>${hostLabel}</span><span class="mp-role-tag">${t('mp_host_tag')}</span></div>`;
    list.forEach(p => {
        const isMe = p.id === mpMyId;
        html += `<div class="mp-participant-row"><span>${p.name}${isMe ? ' (' + t('mp_you') + ')' : ''}</span>${showKick ? `<button class="mp-kick-btn" onclick="mpHostKick('${p.id}')">${t('mp_kick')}</button>` : ''}</div>`;
    });
    el.innerHTML = html;
}

// play-setup画面のSTARTボタンから呼ばれる共通の入口。
function handleSetupStart() {
    if (mpMode === 'host') startHostingFlow();
    else startCountdown();
}

// 全クライアント共通のメッセージ処理(ホスト・参加者どちらの立場でも呼ばれる)
function handleMpMessage(data) {
    if (data.type === 'roster') {
        mpAllowLateJoin = data.allowLateJoin;
        if (mpMode === 'host') renderMpParticipantList(mpHostConns);
        else renderMpParticipantList(data.participants, data.hostName);
    } else if (data.type === 'start') {
        // ★ホストが既に進行中のラウンドを打ち切って次を始めた場合、参加者側は
        // 自分がまだプレイ中でも新しいラウンドへ切り替える(ホストの判断を優先)
        if (typeof isPlaying !== 'undefined' && isPlaying) { mpAbortCurrentRoundSilently(); }
        startMultiplayerRound(data.isCjk, data.mode, data.targetValue, data.questions);
    } else if (data.type === 'leaderboard') {
        renderMpRankingIfVisible();
    } else if (data.type === 'round_over') {
        mpEnterRankingScreen(data.reason);
    } else if (data.type === 'kicked') {
        mpTeardown();
        openScreen('mode-select-screen');
        alert(t('mp_you_were_kicked'));
    } else if (data.type === 'host_disconnected') {
        mpEnterRankingScreen('host_left');
    }
}

// マルチプレイのラウンド終了(自分自身の完走、ホスト離脱、全員離脱いずれか)後に
// 表示するランキング画面。ホストのみ「続ける」ボタンが有効になる。
function mpEnterRankingScreen(reason) {
    // ★強制終了(ホスト離脱/全員離脱)の場合、自分がまだプレイ中である可能性がある。
    // 画面だけ切り替えてタイマーや入力判定が裏で動き続けないよう、先に停止する。
    if (reason && typeof isPlaying !== 'undefined' && isPlaying) { mpAbortCurrentRoundSilently(); }

    openScreen('mp-ranking-screen');
    renderMpRankingIfVisible();

    const statusEl = document.getElementById('mp-ranking-status');
    if (reason === 'host_left') statusEl.innerText = t('mp_host_left');
    else if (reason === 'all_left') statusEl.innerText = t('mp_all_left');
    else statusEl.innerText = '';

    const continueBtn = document.getElementById('mp-continue-btn');
    continueBtn.classList.toggle('hidden', mpMode !== 'host' || reason === 'host_left');
}

function renderMpRankingIfVisible() {
    const listEl = document.getElementById('mp-ranking-list');
    if (!listEl) return;
    const entries = mpLastLeaderboard;
    if (!entries.length) return;

    const top5 = entries.slice(0, 5);
    const mine = entries.find(e => e.id === mpMyId);
    let html = top5.map(e => mpRankRowHtml(e)).join('');
    if (mine && !top5.some(e => e.id === mine.id)) {
        html += `<div class="mp-rank-sep">...</div>` + mpRankRowHtml(mine);
    }
    listEl.innerHTML = html;
}

function mpRankRowHtml(e) {
    const isMe = e.id === mpMyId;
    return `<div class="mp-rank-row${isMe ? ' mp-rank-me' : ''}"><span class="mp-rank-num">#${e.rank}</span><span class="mp-rank-name">${e.name}</span><span class="mp-rank-score">${e.score.toLocaleString()}</span></div>`;
}

// ホストが「続ける」を押した時: 同じメンバーのまま、最初のホスト時と同じ手順
// (問題セット選択画面)へ戻る。接続はそのまま保持される。
function mpContinueRound() {
    if (mpMode !== 'host') return;
    openScreen('play-select-screen'); renderQuestionSets(); initTagFilters();
}

function cancelMultiplayerSetup() {
    mpTeardown();
    backToMain();
}

/* ==================== オンライン/オフライン検知 ==================== */
// ★サーバーレスで(navigator.onLineという、外部サーバーへの問い合わせなしで
// ブラウザが把握しているネットワークI/Fの状態だけを見る)判定しているため、
// 「OSはオンラインと言っているが実際にはPeerJSのサーバーに届かない」ケースは
// 検知できない。その場合は実際の接続試行時のエラーハンドリング側で拾う。
function updateMultiplayerAvailability() {
    const btn = document.getElementById('mp-select-btn');
    const notice = document.getElementById('mp-offline-inline-notice');
    const online = navigator.onLine;
    if (btn) { btn.disabled = !online; btn.classList.toggle('mp-btn-disabled', !online); }
    if (notice) notice.classList.toggle('hidden', online);
}
window.addEventListener('online', updateMultiplayerAvailability);
window.addEventListener('offline', updateMultiplayerAvailability);
