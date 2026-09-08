/* ==========================================
   navigation.js — 画面(screen)切り替えの共通処理
========================================== */

function openScreen(id) {
    playCyberSound('click');
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    el.classList.add('active');

    // ★以前はCSSの@keyframes(screenFadeIn、filter:blur込み)で画面遷移を
    // 演出していたが、blurフィルターのアニメーションは合成コストが重く、
    // #app-shellのtransform:scale()と重なるとカクつきの原因になっていた。
    // Web Animations APIでopacity/transformだけの軽量なフェードに置き換え、
    // タイミングもJS側で確実に制御する(CSSアニメーションの再生タイミングに頼らない)。
    el.animate(
        [
            { opacity: 0, transform: 'scale(0.98)' },
            { opacity: 1, transform: 'scale(1)' }
        ],
        { duration: 200, easing: 'ease-out' }
    );
}
function backToMain() {
    // ★マルチプレイのP2P接続は「メインメニューに戻る」で必ず切断する。
    // 単純化のため、対戦を続けたい場合は毎回ホスト/参加をやり直す仕様にしている。
    if (typeof mpTeardown === 'function') mpTeardown();
    openScreen('main-menu-screen');
}
function toggleFullscreen() { !document.fullscreenElement ? document.documentElement.requestFullscreen() : document.exitFullscreen?.(); }

// ★以前は全ボタンに onmouseenter="playCyberSound('hover')" を個別に付けていたが、
// 12箇所以上に同じ記述が散らばりHTMLが冗長だったため、イベント委譲に一本化。
// mouseoverはバブリングするため、e.relatedTargetが対象要素の外から来た場合のみ
// 発火させることで mouseenter と同じ「入った瞬間だけ」の挙動を再現している。
const HOVER_SOUND_SELECTOR = '.cyber-btn, .cyber-btn-primary, .cyber-btn-sub, .status-row, .best-box';
function initHoverSounds() {
    document.addEventListener('mouseover', (e) => {
        const target = e.target.closest(HOVER_SOUND_SELECTOR);
        if (target && (!e.relatedTarget || !target.contains(e.relatedTarget))) {
            playCyberSound('hover');
        }
    });
}
