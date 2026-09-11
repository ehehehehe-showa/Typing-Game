/* ==========================================
   script.js — アプリのエントリーポイント
   各機能モジュール(settings/records/typing-engine/hud/game/screens...)を
   初期化してつなぎ合わせるだけの役割に専念する。
   個々の機能を直したいときは、対応する各ファイルを編集すること:
     - 判定ロジックを直したい      → typing-engine.js
     - スコア/コンボ/キーボード等の見た目 → hud.js
     - ゲームの進行(出題/終了)や入力処理 → game.js
     - 「問題を選択」画面           → screens/play-select.js
     - 「設定」画面                → screens/settings-screen.js
     - 「ステータス」画面           → screens/status-screen.js
     - 効果音                    → audio.js
     - 問題データ(fetch()で読み込み)  → questions.js
     - 翻訳                     → lang.js
     - 読み込み失敗時のフォールバック   → fallback.js
     - 不正操作の検知             → anticheat.js
========================================== */

window.onload = () => {
    // ★このturnの一番の目的: 「何かの初期化が失敗しても、アプリ全体が
    // 無反応な白い画面のまま固まらない」ようにすること。個々の初期化関数の
    // 内部でも防御しているが、万一想定していない例外が飛んできても、
    // ここで丸ごと捕まえてグローバルエラー通知だけは必ず出す。
    try {
        cacheDOM();
        currentLang = appSettings.lang;

        initLayout();
        initSettingsScreen();
        applyTranslations();
        initKeyboard();
        initMatrixBackground();
        initHoverSounds();
        audioManager.init();
        updateMultiplayerAvailability();

        // ★questionSetsに依存する初期表示(ステータス画面のセレクトボックス等)は
        // fetch()の完了を待つ必要がある。window.onloadはfetchの完了を待たない
        // ため、ここでは触れず、fallback.jsのquestionsReadyイベント側で
        // (読み込み成功/失敗どちらの場合も)まとめて反映させている。
    } catch(e) {
        console.error('[script] 初期化中に予期しないエラーが発生しました:', e);
        if (typeof showGlobalErrorToast === 'function') {
            showGlobalErrorToast(typeof safeT === 'function' ? safeT('global_error_toast', '問題が発生しました。改善しない場合はページを再読み込みしてください。') : '問題が発生しました。改善しない場合はページを再読み込みしてください。');
        }
    }
};

// ★PWA対応: service workerを登録し、オフラインでも起動・プレイできるようにする。
// 対応していない環境(古いブラウザ等)では単に何も起きないだけで、
// アプリ本体の動作には影響しない。
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js').catch((e) => {
            console.error('[script] service workerの登録に失敗しました:', e);
        });
    });
}
