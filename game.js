/* ==========================================
   game.js — タイピングのゲームフロー・状態管理
   カウントダウン → 出題 → 入力判定 → 終了 → 記録保存、という
   1プレイセッションの流れをすべてここで管理する。
   ローマ字判定そのものはtyping-engine.js、見た目の反映はhud.jsに委譲する。
========================================== */

let currentMode, targetValue, timeElapsed, timeLeft, isPlaying = false;
let stats, currentQuestions = [], questionBag = [], globalBlocks = [], kanaToPartIdx = [], currentTextParts = [];
let currentBlockIndex = 0, typedCharsInBlock = "", remainingKana = "", currentOptions = [];
let lastCharWasShortN = false;
let activeCategoryId = null; // ★以前は宣言なしの暗黙グローバルだったため明示的に宣言
let activeIsCjk = true; // 現在プレイ中の問題セットがふりがなを必要とする言語かどうか
let activeSet = null; // 現在プレイ中の問題セット本体(forceSettings判定などに使う)
let sessionAborted = false; // Escapeなどで途中終了したかどうか(競技セットの記録スキップ判定用)
let sessionStartTime = 0; // ★タイマーの基準となる実時刻(performance.now())
let timerRafId = null;

function startCountdown() {
    // ★questionSetsが1件も読み込めていない場合(オフライン/読み込み失敗等)に
    // questionSets[0]へアクセスして例外で落ちないよう、まずここで安全に止める。
    // 本来はこの画面に来る前にPLAYボタン側で弾いているはずだが、念のための多重防御。
    if (!Array.isArray(questionSets) || questionSets.length === 0) {
        if (typeof showQuestionsUnavailableNotice === 'function') showQuestionsUnavailableNotice();
        backToMain();
        return;
    }

    activeCategoryId = selectedQSetId || questionSets[0].id;
    const set = questionSets.find(s => s.id === activeCategoryId) || questionSets[0];
    activeSet = set;
    currentQuestions = set.questions; questionBag = [];
    activeIsCjk = set.is_cjk !== false; // 未指定時は後方互換で従来通りCJK扱い
    sessionAborted = false;

    // is_cjk:falseのセットはふりがな(小さい読み表示)が不要なため、
    // そのぶんのスペースを詰めるクラスを付け外しする(hud.js側のCSSで対応)
    document.getElementById('typing-area').classList.toggle('no-furigana', !activeIsCjk);

    // HTML側の入力制限に加えてJS側でも異常値をブロック
    if (set.forceSettings) {
        currentMode = set.forceSettings.mode; targetValue = set.forceSettings.target;
    } else {
        currentMode = document.getElementById('play-mode').value;
        let val = parseInt(document.getElementById('play-value').value) || 60;
        targetValue = Math.min(9999, Math.max(1, val)); // 1〜9999の範囲に強制
    }

    runCountdown();
}

// ★マルチプレイ(ホストが開始を確定した直後、および参加者がホストからの
// 開始合図を受け取った直後)は、既に確定済みの出題データを使って、通常の
// カウントダウン以降と同じ流れに合流する。出題順はホスト側で1度だけ確定させた
// ものをそのまま使う(questionsArrはシャッフル済みの配列そのもの)。
function startMultiplayerRound(isCjk, mode, target, questionsArr) {
    activeSet = { id: 'multiplayer', questions: questionsArr, is_cjk: isCjk };
    activeCategoryId = null; // マルチプレイの結果はローカルの練習履歴には保存しない
    currentQuestions = questionsArr; questionBag = [];
    activeIsCjk = isCjk;
    sessionAborted = false;
    document.getElementById('typing-area').classList.toggle('no-furigana', !isCjk);
    currentMode = mode; targetValue = target;

    document.body.classList.add('mp-active');

    runCountdown();
}

// ホストが現在のラウンドを打ち切って次のラウンドを始めた時、まだ自分の
// ラウンドが終わっていない参加者側で呼ばれる。記録の保存や後片付けだけ行い、
// 直後にstartMultiplayerRound()で新しいラウンドへ切り替わる。
function mpAbortCurrentRoundSilently() {
    isPlaying = false;
    if (timerRafId) { cancelAnimationFrame(timerRafId); timerRafId = null; }
}

function runCountdown() {
    openScreen('countdown-screen');
    let count = 3;
    document.getElementById('countdown-number').innerText = count; document.getElementById('countdown-number').setAttribute('data-text', count);

    const iv = setInterval(() => {
        count--;
        if(count > 0) {
            document.getElementById('countdown-number').innerText = count; document.getElementById('countdown-number').setAttribute('data-text', count); playCyberSound('click');
        } else if (count === 0) {
            document.getElementById('countdown-number').innerText = "START"; document.getElementById('countdown-number').setAttribute('data-text', "START"); playCyberSound('hit');
        } else {
            clearInterval(iv); startGame();
        }
    }, 1000);
}

function startGame() {
    timeElapsed = 0; timeLeft = currentMode === 'time' ? targetValue : 0;
    stats = { correct: 0, miss: 0, total: 0, questionsCompleted: 0, score: 0, combo: 0 };
    if (typeof acResetSession === 'function') acResetSession();
    isPlaying = true; lastCharWasShortN = false; openScreen('game-screen'); nextQuestion();

    DOM.score.innerText = stats.score.toLocaleString();
    if(DOM.combo) DOM.combo.innerText = stats.combo;

    // ★以前はsetIntervalで「100msごとに0.1減らす」実装だったが、これは
    // 「必ず100msごとに呼ばれる」という前提に依存していた。OSのキーリピート等で
    // メインスレッドが混雑すると、setIntervalのコールバック自体(低優先度のマクロタスク)が
    // 遅延・スキップされ、「内部時間は正しく進んでいるのに画面の数字表示だけが
    // 更新されず止まって見える」現象が起きていた。
    // requestAnimationFrameは描画パイプラインに同期して呼ばれるため、実際に画面が
    // 更新されるタイミングと表示の更新が食い違うことがない。
    sessionStartTime = performance.now();
    if (timerRafId) cancelAnimationFrame(timerRafId);
    function timerLoop() {
        if (!isPlaying) { timerRafId = null; return; }
        const elapsedSec = (performance.now() - sessionStartTime) / 1000;
        if (currentMode === 'time') {
            timeLeft = targetValue - elapsedSec;
            if (timeLeft <= 0) { timeLeft = 0; DOM.timeDisplay.innerText = "0.0"; timerRafId = null; endGame(); return; }
        } else {
            timeElapsed = elapsedSec;
        }
        DOM.timeDisplay.innerText = (currentMode === 'time' ? timeLeft : timeElapsed).toFixed(1);
        timerRafId = requestAnimationFrame(timerLoop);
    }
    timerRafId = requestAnimationFrame(timerLoop);
}

function nextQuestion() {
    if(currentMode === 'amount' && stats.questionsCompleted >= targetValue) { endGame(); return; }
    if (questionBag.length === 0) {
        questionBag = [...currentQuestions];
        // ★マルチプレイはホスト側で1度だけ確定させた出題順をそのまま使うため、
        // ここで再シャッフルすると両者の出題順が(各クライアントで別々の乱数を
        // 使うことになり)ズレてしまう。マルチプレイ時はシャッフルしない。
        if (!mpIsMultiplayer) shuffleArray(questionBag);
    }
    const raw = questionBag.pop();
    // is_cjk:false のセットはプレーンな文字列("hello"等)がそのまま登録されているため、
    // {text, kana}形式に正規化し、以降はCJKと同じ処理を通す(文字そのものを読みとして扱う)。
    const q = activeIsCjk ? raw : { text: raw, kana: raw };

    // ★text側も「|」区切りに対応。以前はtextを1文字ずつ(Array.from)に分解して
    // kanaの各グループへ機械的に対応させていたため、「今日」を1文字ずつ「きょ」「う」に
    // 割り当てるなど、2文字以上でまとまった読みをする語のふりがな表示がおかしくなったり、
    // (登録側のkana区切り数と文字数がズレた場合は)それ以降の文字とふりがなの対応が
    // まるごとズレる実バグにもなっていた。今後はtext側にも同じ数の「|」を入れて登録することで、
    // 複数文字をまとめて1つの読みグループにできる(例: "今日|は" / "きょう|は")。
    currentTextParts = q.text.split('|');
    const kanaParts = q.kana.split('|');

    kanaToPartIdx = [];
    kanaParts.forEach((part, idx) => { for(let i=0; i<part.length; i++) kanaToPartIdx.push(idx); });

    let fullKana = kanaParts.join(''); remainingKana = fullKana;
    globalBlocks = []; let blockCounter = 0; let tempKana = fullKana; let charOffset = 0;

    while(tempKana.length > 0) {
        let opts = getBlockOptions(tempKana);
        let pIdx = kanaToPartIdx[charOffset];
        // 非CJK(英単語など)はふりがな相当が無いため、ブロック上の小さい読み表示は空にする
        globalBlocks.push({ id: blockCounter++, kana: activeIsCjk ? opts[0].kana : "", romaji: opts[0].romaji, partIdx: pIdx });
        charOffset += opts[0].kana.length; tempKana = tempKana.substring(opts[0].kana.length);
    }

    typedCharsInBlock = ""; currentBlockIndex = 0;
    currentOptions = getBlockOptions(remainingKana);
    renderBlocksHTML(); cacheActiveNodes();
}

function endGame() {
    isPlaying = false;
    if (timerRafId) { cancelAnimationFrame(timerRafId); timerRafId = null; }
    const timeUsed = currentMode === 'time' ? (targetValue - timeLeft) : timeElapsed;
    const minUsed = timeUsed / 60;
    // WPMはプレイ中のスコアボーナス計算(hud.jsのaddScore内)と同じ「正解数ベース」に統一している
    const vals = { total: stats.total, wpm: minUsed > 0 ? Math.floor((stats.correct / 5) / minUsed) : 0, cpm: minUsed > 0 ? Math.floor(stats.total / minUsed) : 0, kpm: minUsed > 0 ? Math.floor(stats.correct / minUsed) : 0, correct: stats.correct, miss: stats.miss, acc: stats.total === 0 ? "0%" : ((stats.correct / stats.total) * 100).toFixed(1) + "%", err: stats.total === 0 ? "0%" : ((stats.miss / stats.total) * 100).toFixed(1) + "%" };

    if (mpIsMultiplayer) {
        // ★マルチプレイの対戦結果は個人の練習履歴/ベスト記録には保存しない
        // (シングルプレイの記録と混ざってしまうため)。代わりにスコア順のランキング画面へ。
        mpSendFinished(vals.wpm, vals.acc);
        mpEnterRankingScreen(null);
        return;
    }

    document.getElementById('result-score-val').innerText = stats.score.toLocaleString();
    let html = ''; resultStatsKeys.forEach(key => { if(appSettings.resultToggles[key]) { html += `<div class="res-item"><span style="font-size:0.9rem; color:var(--text-muted)">${t('res_' + key)}</span><span class="res-val">${vals[key]}</span></div>`; } }); document.getElementById('dynamic-result-grid').innerHTML = html;
    openScreen('result-screen');

    // ★競技設定(forceSettings)のセットをEscape等で途中終了した場合は、
    // 未完走の記録が正式なベスト/履歴に混ざらないよう保存自体をスキップする。
    // (弱い記録として履歴を汚したくない、という意図)
    // ・forceSettingsが無いカスタム設定のセットはsaveRecord内で保存対象外になる
    //   (モード/目標値を自由に選べるため、記録同士を比較する前提が揃わないため)
    const isCompetitionAbort = sessionAborted && activeSet && activeSet.forceSettings;
    if (!isCompetitionAbort) {
        const d = new Date(); const record = { date: `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`, score: stats.score, wpm: vals.wpm, acc: vals.acc, fullStats: vals };
        saveRecord(activeCategoryId, record, activeSet);
    }
}

/* ---- キー入力ハンドラ ----
   ここがタイピング判定の本体。typing-engine.js(getBlockOptions)で候補を絞り込み、
   hud.js(addScore/subScore/flashKey/renderBlocksHTMLなど)へ結果を反映させる。 */
function handleTypingKeydown(e) {
    if (!isPlaying) {
        if (e.key === ' ' && document.getElementById('main-menu-screen').classList.contains('active')) { e.preventDefault(); openModeSelect(); }
        return;
    }
    if (e.key === 'Escape') { sessionAborted = true; endGame(); return; }
    if (e.key.length !== 1 || e.ctrlKey || e.altKey || e.metaKey) return;
    // ★アンチチート: dispatchEvent()等で合成された(実ユーザーの操作ではない)
    // キー入力を弾く。isTrustedはブラウザ自身が保証する値なので比較的信頼できる。
    if (!acCheckTrustedEvent(e)) return;

    // ★以前は常にtoLowerCase()していたため、cjk:false(英語などの直接入力)で
    // 大文字(例: "This"の T)を正しくShift入力しても小文字化されてしまい、
    // ターゲット文字列側の大文字と一致せず「入力できない」ように見えるバグがあった。
    // ローマ字入力(CJK)は元々大文字小文字を区別しない仕様なので、
    // is_cjk:falseの時だけ大文字小文字をそのまま区別して判定するようにする。
    const inputKey = activeIsCjk ? e.key.toLowerCase() : e.key;

    if (lastCharWasShortN && inputKey === 'n') {
        lastCharWasShortN = false; stats.correct++; stats.total++;
        addScore(); flashKey(inputKey, true); playCyberSound('hit'); return;
    }

    lastCharWasShortN = false; stats.total++;
    let matchedOption = null; let newOptions = []; const attempt = typedCharsInBlock + inputKey;

    for (let i = 0; i < currentOptions.length; i++) {
        if (currentOptions[i].romaji.startsWith(attempt)) { newOptions.push(currentOptions[i]); if (!matchedOption) matchedOption = currentOptions[i]; }
    }

    if (newOptions.length > 0) {
        if(activeBlockEl) activeBlockEl.classList.remove('b-error');
        stats.correct++; typedCharsInBlock += inputKey; currentOptions = newOptions;
        flashKey(inputKey, true);

        let perfectMatch = null;
        for (let i = 0; i < currentOptions.length; i++) { if (currentOptions[i].romaji === typedCharsInBlock) { perfectMatch = currentOptions[i]; break; } }

        if (perfectMatch) {
            if (perfectMatch.kana === 'ん' && perfectMatch.romaji === 'n') lastCharWasShortN = true;
            typedCharsInBlock = ""; remainingKana = remainingKana.substring(perfectMatch.len);

            if (remainingKana.length === 0) {
                stats.questionsCompleted++;
                activeBlockEl.classList.add('b-finished');
                activeNodeTyped.textContent = perfectMatch.romaji; activeNodeUntyped.textContent = "";
                addScore();
                if (currentMode === 'amount' && stats.questionsCompleted >= targetValue) endGame(); else nextQuestion();
                return;
            }

            let targetBlock = globalBlocks[currentBlockIndex];
            if (perfectMatch.len !== targetBlock.kana.length) {
                let currentOffset = 0;
                for(let k = 0; k < currentBlockIndex; k++) currentOffset += globalBlocks[k].kana.length;
                currentOffset += perfectMatch.kana.length;

                let newRest = []; let temp = remainingKana; let trackOffset = currentOffset;
                while(temp.length > 0) {
                    let opts = getBlockOptions(temp);
                    let pIdx = kanaToPartIdx[trackOffset] !== undefined ? kanaToPartIdx[trackOffset] : kanaToPartIdx[kanaToPartIdx.length-1];
                    newRest.push({ kana: opts[0].kana, romaji: opts[0].romaji, partIdx: pIdx });
                    trackOffset += opts[0].kana.length; temp = temp.substring(opts[0].kana.length);
                }
                globalBlocks = globalBlocks.slice(0, currentBlockIndex + 1).concat(newRest);
                currentBlockIndex++; currentOptions = getBlockOptions(remainingKana);
                renderBlocksHTML();
            } else {
                currentBlockIndex++; currentOptions = getBlockOptions(remainingKana);
                activeBlockEl.classList.add('b-finished');
                activeNodeTyped.textContent = perfectMatch.romaji; activeNodeUntyped.textContent = "";
            }
            addScore();
            // ★cacheActiveNodes()(スクロール位置の再計算)とヒット時のポップ演出を
            // 強制リフローなしで次の描画フレームにまとめる
            refreshTypingViewport(true);
        } else {
            activeNodeTyped.textContent = typedCharsInBlock;
            activeNodeUntyped.textContent = matchedOption.romaji.substring(typedCharsInBlock.length);
            addScore();
            pulseHit(activeNodeTyped);
        }
        playCyberSound('hit');
    } else {
        stats.miss++; subScore();
        flashKey(inputKey, false); triggerDamage();
        // ★b-errorクラスは.t-untypedの赤色ハイライトを「訂正されるまで持続」させる
        // ための状態トグルなので維持しつつ、揺れ(シェイク)の一撃演出だけを
        // Web Animations APIのshakeError()に分離した。
        if (activeBlockEl) activeBlockEl.classList.add('b-error');
        shakeError(activeBlockEl);
        playCyberSound('miss');
    }
}
document.addEventListener('keydown', handleTypingKeydown);
