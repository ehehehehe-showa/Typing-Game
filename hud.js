/* ==========================================
   hud.js — プレイ中の画面表示(HUD)
   スコア・コンボ・タイマー・キーボード表示・タイピングブロック・
   ダメージ演出など「ゲーム状態をどう見せるか」に専念する。
   ゲームの状態そのもの(stats, currentBlockIndexなど)はgame.js側が持ち、
   ここではその値を読んでDOMに反映するだけ。
========================================== */

const DOM = {};
function cacheDOM() {
    DOM.score = document.getElementById('score');
    DOM.combo = document.getElementById('combo');
    DOM.timeDisplay = document.getElementById('time-display');
    DOM.blocksContainer = document.getElementById('blocks-container');
    DOM.keyboard = document.getElementById('keyboard-container');
}

// 現在アクティブなタイピングブロックのDOM参照キャッシュ
let activeNodeTyped = null, activeNodeUntyped = null, activeBlockEl = null;

/* ---- キーボード表示 ---- */
const kbLayout = [ ['q','w','e','r','t','y','u','i','o','p'], ['a','s','d','f','g','h','j','k','l'], ['z','x','c','v','b','n','m','-'] ];
const keyElements = {};
function initKeyboard() { let html = ''; kbLayout.forEach(row => { html += `<div class="key-row">`; row.forEach(k => { html += `<div class="key" id="key-${k}">${k.toUpperCase()}</div>`; }); html += `</div>`; }); DOM.keyboard.innerHTML = html; kbLayout.flat().forEach(k => { keyElements[k] = document.getElementById(`key-${k}`); }); }

function flashKey(key, isHit) {
    // ★物理キーは大文字小文字で同じ場所にあるため、キーボード表示のハイライトは
    // 常に小文字側で引く(cjk:falseで大文字がそのまま渡ってきても対応できるように)
    const el = keyElements[key.toLowerCase()];
    if(el) {
        const cls = isHit ? 'hit' : 'miss';
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), 100);
    }
}

/* ---- ダメージ演出 ---- */
// ★以前はCSSのtransition+class付け外し(setTimeoutで50ms後に外す)だったが、
// 連続してミスするとタイミングが重なりやすく、"cssに頼り過ぎない"方針もあり
// Web Animations APIに統一。com.animate()は呼ぶたびに独立したアニメーションを
// 生成するので、連打で重なっても壊れず、強制リフローの類も一切不要。
function triggerDamage() {
    const overlay = document.getElementById('damage-overlay');
    if (!overlay) return;
    overlay.animate(
        [ { opacity: 1 }, { opacity: 0 } ],
        { duration: 200, easing: 'ease-out' }
    );
}

/* ---- ワンショット演出(Web Animations API) ----
   以前はCSSの@keyframes + classList.remove/addの「付け直し」で表現しており、
   高速な連打では前のアニメーションと衝突したり、再生タイミングがCSSエンジン任せに
   なってジャンクの原因になっていた。Web Animations APIはJS側から呼ぶたびに
   独立したアニメーションとして再生され、前のものを自然に上書きしてくれるため、
   強制リフローのようなハックが不要で、連打時も途切れず滑らかに再生できる。 */
function pulseCombo(el) {
    if (!el) return;
    el.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.3)', color: '#fff', textShadow: '0 0 20px var(--accent-glow)' },
        { transform: 'scale(1)' }
    ], { duration: 200, easing: 'ease-out' });
}

function pulseHit(el) {
    if (!el) return;
    el.animate([
        { color: 'var(--accent-color)' },
        { color: '#fff', textShadow: '0 0 15px var(--accent-glow)', transform: 'scale(1.05)' },
        { color: 'var(--accent-color)' }
    ], { duration: 150, easing: 'ease-out' });
}

function shakeError(el) {
    if (!el) return;
    el.animate([
        { transform: 'translateX(0)' },
        { transform: 'translateX(-4px) rotate(-1deg)' },
        { transform: 'translateX(4px) rotate(1deg)' },
        { transform: 'translateX(-4px) rotate(-1deg)' },
        { transform: 'translateX(0)' }
    ], { duration: 200, easing: 'ease-in-out' });
}

// ブロック進行後の見た目更新(アクティブブロック再キャッシュ・スクロール・
// タイプ済み文字のポップ演出)をまとめてrAFの1フレームに集約する。
// cacheActiveNodes()自体がレイアウトを読む(スクロール計算)ため、
// スコア加算などの他の同期処理と分離して次の描画直前にまとめて行う。
function refreshTypingViewport(playHitPulse) {
    requestAnimationFrame(() => {
        cacheActiveNodes();
        if (playHitPulse) pulseHit(activeNodeTyped);
    });
}

/* ---- スコア・コンボ ----
   加点/減点のロジック自体はここに置いているが、参照している
   currentMode/targetValue/timeLeft/timeElapsed/statsはgame.js側の状態。 */
function addScore() {
    stats.combo++;
    let elapsedSec = currentMode === 'time' ? (targetValue - timeLeft) : timeElapsed;
    if(elapsedSec < 0.1) elapsedSec = 0.1;

    let currentWPM = ((stats.correct / 5) / (elapsedSec / 60));
    let accuracy = stats.total > 0 ? (stats.correct / stats.total) : 1;

    let basePoint = 10;
    let comboBonus = Math.min(stats.combo, 50);
    let speedBonus = Math.floor(currentWPM / 10);

    let earned = Math.round((basePoint + comboBonus + speedBonus) * accuracy);
    stats.score += earned;
    DOM.score.innerText = stats.score.toLocaleString();

    if(DOM.combo) {
        DOM.combo.innerText = stats.combo;
        pulseCombo(DOM.combo);
    }

    // マルチプレイ中は自分の進捗を相手へ間引いて送る(multiplayer.js側で頻度を制御)
    if (typeof mpMaybeSendProgress === 'function') mpMaybeSendProgress();
}

function subScore() {
    stats.combo = 0;
    stats.score = Math.max(0, stats.score - 50);
    DOM.score.innerText = stats.score.toLocaleString();
    if(DOM.combo) DOM.combo.innerText = stats.combo;
}

/* ---- タイピングブロックの描画 ----
   globalBlocks/currentBlockIndex/currentTextParts/currentOptions/typedCharsInBlockは
   game.js側が保持する「現在の出題状態」を読み取って描画する。 */

// ★CSSのscroll-behavior:smoothは「前の目標に向かうアニメーション」を
// 新しいscrollLeft代入で強制的に作り直す挙動のため、高速タイピング時に
// 目標を追いかけきれず表示が固まって見える原因になっていた(auto化で解消済み)。
// その代わり、ここでは短いduration・現在位置からの再スタートに対応した
// 自前のイージングでスクロールし、見た目の滑らかさを取り戻しつつ、
// 連続して呼ばれても必ず「今の実位置」から次の目標へ滑らかに繋げる。
let scrollAnimFrame = null;
function smoothScrollTo(el, target, duration = 140) {
    if (scrollAnimFrame) cancelAnimationFrame(scrollAnimFrame);
    const start = el.scrollLeft;
    const change = target - start;
    if (Math.abs(change) < 1) { el.scrollLeft = target; scrollAnimFrame = null; return; }
    const startTime = performance.now();
    function step(now) {
        const t = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        el.scrollLeft = start + change * eased;
        scrollAnimFrame = (t < 1) ? requestAnimationFrame(step) : null;
    }
    scrollAnimFrame = requestAnimationFrame(step);
}

function scrollToActiveBlock() {
    if (!activeBlockEl) return;
    const typingArea = document.getElementById('typing-area');

    // ★以前はoffsetParentを手動で辿って#typing-areaからの相対位置を計算していたが、
    // #typing-area/#blocks-container/.word-partにposition指定が無いため、
    // 辿った先が実際には<body>まで到達してしまい、意図した相対位置と大きくズレていた。
    // (結果、スクロール位置の計算が誤り、進んでいるのに背後のテキストが
    //  「止まって見える→ある時点で急に飛ぶ」という不具合になっていた)
    // getBoundingClientRect()はposition指定の有無に関係なく正確なビューポート座標を
    // 返すため、両者の差分を取るだけで正しい相対位置が求まる。
    const blockRect = activeBlockEl.getBoundingClientRect();
    const areaRect = typingArea.getBoundingClientRect();
    const blockOffsetInContent = (blockRect.left - areaRect.left) + typingArea.scrollLeft;

    const scrollPos = blockOffsetInContent - (areaRect.width / 2) + (blockRect.width / 2);
    smoothScrollTo(typingArea, Math.max(0, scrollPos));
}

function updatePartHighlight() {
    const targetPartIdx = globalBlocks[currentBlockIndex]?.partIdx ?? -1;
    document.querySelectorAll('.word-part').forEach((el, idx) => {
        el.classList.remove('current', 'finished');
        if (idx < targetPartIdx) el.classList.add('finished');
        else if (idx === targetPartIdx) el.classList.add('current');
    });
}

function cacheActiveNodes() {
    activeBlockEl = document.getElementById(`blk-${currentBlockIndex}`);
    if(activeBlockEl) {
        activeNodeTyped = activeBlockEl.querySelector('.t-typed');
        activeNodeUntyped = activeBlockEl.querySelector('.t-untyped');
        scrollToActiveBlock();
    }
    updatePartHighlight();
}

function renderBlocksHTML() {
    let html = ""; let currentPIdx = -1; let targetPartIdx = globalBlocks[currentBlockIndex]?.partIdx ?? -1;

    globalBlocks.forEach((blk, i) => {
        if (blk.partIdx !== currentPIdx) {
            if (currentPIdx !== -1) html += `</div></div>`;
            currentPIdx = blk.partIdx;
            let partCls = "word-part";
            if (currentPIdx < targetPartIdx) partCls += " finished";
            else if (currentPIdx === targetPartIdx) partCls += " current";
            html += `<div class="${partCls}" id="part-${currentPIdx}">`;
            html += `<div class="kanji">${currentTextParts[currentPIdx] || ""}</div>`;
            html += `<div class="kana-romaji-group">`;
        }

        let cls = i < currentBlockIndex ? "type-block b-finished" : "type-block";
        let typedTxt = ""; let untypedTxt = "";

        if (i < currentBlockIndex) {
            typedTxt = blk.romaji;
        } else if (i === currentBlockIndex) {
            typedTxt = typedCharsInBlock;
            untypedTxt = (currentOptions.length > 0) ? currentOptions[0].romaji.substring(typedCharsInBlock.length) : blk.romaji.substring(typedCharsInBlock.length);
        } else { untypedTxt = blk.romaji; }

        html += `<div id="blk-${i}" class="${cls}"><div class="kana">${blk.kana}</div><div class="romaji"><span class="t-typed">${typedTxt}</span><span class="t-untyped">${untypedTxt}</span></div></div>`;
    });

    if (currentPIdx !== -1) html += `</div></div>`;
    DOM.blocksContainer.innerHTML = html;
}
