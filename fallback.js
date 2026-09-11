/* ==========================================
   fallback.js — 「何かあったときに黙って無反応にならない」ための仕組み。

   1. 問題データが1件も読み込めなかった場合のフォールバックUI
      (オフライン、manifestのJSON構文ミス、ネットワーク遮断など、
       原因を問わず「読み込めなかった」事実そのものを検知して知らせる)
   2. アプリ全体のグローバルエラー通知
      (コンソールを見られる人にしか気づけないエラーを、画面上の小さな
       通知でも見えるようにする。処理は可能な限り継続させる)
========================================== */

/* ---- 問題データの読み込み失敗フォールバック ---- */

function showQuestionsUnavailableNotice() {
    try {
        const banner = document.getElementById('questions-unavailable-banner');
        if (banner) banner.classList.remove('hidden');
        const playBtn = document.getElementById('main-play-btn');
        if (playBtn) { playBtn.disabled = true; playBtn.classList.add('mp-btn-disabled'); }
    } catch(e) { console.error('[fallback] フォールバック表示自体に失敗しました:', e); }
}

function hideQuestionsUnavailableNotice() {
    try {
        const banner = document.getElementById('questions-unavailable-banner');
        if (banner) banner.classList.add('hidden');
        const playBtn = document.getElementById('main-play-btn');
        if (playBtn) { playBtn.disabled = false; playBtn.classList.remove('mp-btn-disabled'); }
    } catch(e) { console.error('[fallback] フォールバック解除に失敗しました:', e); }
}

// バナーの「再読み込み」ボタンから呼ばれる。ページ全体のreloadではなく、
// まず問題データの再取得だけを試みる(通信が一時的に不安定だっただけなら
// これで直る可能性があるため)。
function retryLoadQuestions() {
    try {
        const statusEl = document.getElementById('q-retry-status');
        if (statusEl) statusEl.innerText = safeT('q_retrying', '再試行しています...');
        if (typeof loadQuestionSets === 'function') {
            loadQuestionSets();
        } else {
            // questions.js自体が読み込めていない、より深刻な失敗のケース
            location.reload();
        }
    } catch(e) {
        console.error('[fallback] 再読み込み処理自体に失敗しました:', e);
        location.reload();
    }
}

window.addEventListener('questionsReady', (e) => {
    try {
        if (e.detail && e.detail.state === 'empty') {
            showQuestionsUnavailableNotice();
        } else {
            hideQuestionsUnavailableNotice();
            if (typeof updateStatusCategoryOptions === 'function') updateStatusCategoryOptions();
        }
    } catch(err) { console.error('[fallback] questionsReadyハンドラでエラー:', err); }
});

/* ---- t()が万一使えない状況でも安全に文言を取れるようにするラッパー ---- */
function safeT(key, fallback) {
    try { if (typeof t === 'function') { const v = t(key); if (v && v !== key) return v; } } catch(e) {}
    return fallback;
}

/* ---- グローバルエラー通知 ----
   想定外の例外・Promise rejectionを、コンソールを見られない一般利用者にも
   気づけるよう、小さな通知バナーとして表示する。アプリを止めることが
   目的ではなく、「何かおかしい」と気づけるようにすることが目的。 */
let globalErrorToastTimer = null;
function showGlobalErrorToast(message) {
    try {
        let toast = document.getElementById('global-error-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'global-error-toast';
            toast.className = 'global-error-toast';
            document.body.appendChild(toast);
        }
        toast.innerText = message;
        toast.classList.add('active');
        clearTimeout(globalErrorToastTimer);
        globalErrorToastTimer = setTimeout(() => { try { toast.classList.remove('active'); } catch(e) {} }, 6000);
    } catch(e) {
        // 通知そのものが失敗した場合、これ以上打てる手が無いのでコンソールに残すのみ
        console.error('[fallback] エラー通知の表示自体に失敗しました:', e);
    }
}

window.addEventListener('error', (e) => {
    console.error('[global error]', e.error || e.message);
    showGlobalErrorToast(safeT('global_error_toast', '問題が発生しました。改善しない場合はページを再読み込みしてください。'));
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('[unhandled rejection]', e.reason);
    showGlobalErrorToast(safeT('global_error_toast', '問題が発生しました。改善しない場合はページを再読み込みしてください。'));
});
