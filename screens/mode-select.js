/* ==========================================
   screens/mode-select.js — 「シングル/マルチ」選択画面まわり
   マルチプレイのホスト/参加フォーム、待機画面、対戦開始への合流を担当する。
   実際のPeerJS通信はmultiplayer.js、ゲーム本編への合流はgame.jsの
   startMultiplayerRound()を呼ぶだけにしている。
========================================== */

function openModeSelect() {
    mpTeardown();
    openScreen('mode-select-screen');
}

function selectSingleMode() {
    mpMode = null; mpIsMultiplayer = false;
    openScreen('play-select-screen'); renderQuestionSets(); initTagFilters();
}

function selectMultiMode() {
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
    document.getElementById('mp-waiting-status').innerText = t('mp_connecting_status');
    openScreen('mp-waiting-screen');

    mpSetMessageHandler(handleMpMessage);
    mpJoin(code, name, (opponentName) => {
        document.getElementById('mp-waiting-status').innerText = `${t('mp_host')}: ${opponentName}`;
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

    // 出題順をこの場で1回だけ確定し、参加者にそのまま送る。
    // (お互い全く同じ順番の問題で対戦するため)
    const sharedQuestions = [...set.questions];
    shuffleArray(sharedQuestions);

    document.getElementById('mp-waiting-title').innerText = t('mp_hosting');
    document.getElementById('mp-waiting-code-box').classList.remove('hidden');
    document.getElementById('mp-room-code-text').innerText = '--------';
    document.getElementById('mp-waiting-status').innerText = t('mp_waiting_opponent');
    openScreen('mp-waiting-screen');

    mpSetMessageHandler(handleMpMessage);
    mpHost(mpMyName, (code) => {
        document.getElementById('mp-room-code-text').innerText = code;
    }, (opponentName) => {
        document.getElementById('mp-waiting-status').innerText = `${t('mp_opponent')}: ${opponentName}`;
        mpSend({ type: 'start', isCjk, mode, targetValue: target, questions: sharedQuestions, hostName: mpMyName });
        startMultiplayerRound(isCjk, mode, target, sharedQuestions);
    }, (err) => {
        document.getElementById('mp-waiting-status').innerText = t('mp_connection_failed');
        console.error('[multiplayer] host error:', err);
    });
}

// play-setup画面のSTARTボタンから呼ばれる共通の入口。
// シングルプレイとホスト(マルチ)とで処理を振り分けるだけ。
function handleSetupStart() {
    if (mpMode === 'host') startHostingFlow();
    else startCountdown();
}

// 参加者側で受信するメッセージ、および双方が対戦中に受け取るメッセージの処理
function handleMpMessage(data) {
    if (data.type === 'start') {
        // 参加者: ホストが確定した内容でそのままゲームに合流する
        startMultiplayerRound(data.isCjk, data.mode, data.targetValue, data.questions);
    } else if (data.type === 'progress') {
        mpUpdateOpponentProgress(data);
    } else if (data.type === 'finished') {
        mpShowOpponentResult(data);
    } else if (data.type === 'disconnect') {
        const tag = document.getElementById('mp-opponent-name-tag');
        if (tag) tag.innerText = t('mp_opponent_disconnected');
    }
}

function cancelMultiplayerSetup() {
    mpTeardown();
    backToMain();
}
