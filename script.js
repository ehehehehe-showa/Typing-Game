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
     - 問題データ                 → questions.js
     - 翻訳                     → lang.js
========================================== */

window.onload = () => {
    cacheDOM();
    currentLang = appSettings.lang;

    initLayout();
    updateStatusCategoryOptions();
    initSettingsScreen();
    applyTranslations();
    initKeyboard();
    initMatrixBackground();
    initHoverSounds();
    audioManager.init();
    updateMultiplayerAvailability();
};
