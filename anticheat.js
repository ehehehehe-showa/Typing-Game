/* ==========================================
   anticheat.js — 不正操作の検知基盤

   ★正直な前提: これはクライアント側(ブラウザのJS)だけで完結する仕組み
   であり、devtoolsでJSを直接書き換えられる相手には原理的に完全な防止は
   できない(サーバー側での再検証が無い以上、最終的な信頼の担保は無い)。
   ここでの目的は「カジュアルな不正の検知」と「明らかにおかしい状態に
   なったら即座にプレイを止める」こと。突破されにくくすることはできても、
   突破不可能にはできない、という前提で設計している。

   検知している主なもの:
   1. 信頼できないキーイベント — dispatchEvent()等で合成されたキー入力
      (実ユーザーの操作ではないもの)をevent.isTrustedで判定して弾く。
      これはブラウザが保証する値なので、比較的信頼できる。
   2. 統計の整合性 — 正解数が総数を超える/コンボが正解数を超える/
      スコアが負になる、といった「本来のゲームロジックでは起こり得ない」
      状態を定期的にチェックし、devtoolsコンソール等からの直接的な
      状態書き換えを検知する。
   3. 異常な入力間隔 — 物理的に不可能な速度での連続正解
      (人間のタイピングとして現実的でない間隔)を検知する。

   検知した場合はacReportViolation()でプレイを即座に停止し、再読み込みする。
========================================== */

let acViolationDetected = false;
let acLastHitTimes = []; // 直近のヒット時刻(ms)を数件保持し、異常な連打間隔を見る
const AC_MIN_HUMANLY_POSSIBLE_INTERVAL_MS = 15; // これより短い間隔の連続正解が続くのは非現実的

function acReportViolation(reason) {
    try {
        if (acViolationDetected) return; // 多重発火防止
        acViolationDetected = true;
        console.warn('[anticheat] 不正な操作の可能性を検知しました:', reason);

        // ゲームを即座に停止する。ここは他モジュールの状態に依存するため、
        // 個々の停止処理自体が失敗しても最終的なreload()だけは必ず実行されるようにする。
        try { if (typeof isPlaying !== 'undefined') isPlaying = false; } catch(e) {}
        try { if (typeof timerRafId !== 'undefined' && timerRafId) cancelAnimationFrame(timerRafId); } catch(e) {}
        try { if (typeof mpIsMultiplayer !== 'undefined' && mpIsMultiplayer && typeof mpSendToHost === 'function') mpSendToHost({ type: 'progress', score: -1, correct: 0, combo: 0 }); } catch(e) {}

        try { alert(safeT ? safeT('anticheat_alert', '不正な操作が検出されたため、プレイを終了します。') : '不正な操作が検出されたため、プレイを終了します。'); } catch(e) {}
    } catch(e) {
        console.error('[anticheat] 違反処理中にさらにエラーが発生しました:', e);
    } finally {
        // ★何が起きても最終的にここには到達させる。中途半端な状態のまま
        // アプリが固まって「何も反応しない」ことだけは避ける。
        try { location.reload(); } catch(e) { /* これ以上は打つ手が無い */ }
    }
}

// 1. 信頼できないキーイベントの検知。game.jsのhandleTypingKeydown冒頭で呼ぶ。
function acCheckTrustedEvent(e) {
    try {
        if (e && e.isTrusted === false) {
            acReportViolation('untrusted-keydown-event');
            return false;
        }
    } catch(err) {
        // isTrustedの参照自体に失敗しても、ここでゲームを壊さないよう通過させる
        console.error('[anticheat] isTrusted確認中にエラー:', err);
    }
    return true;
}

// 2. 統計の整合性チェック。hud.jsのaddScore()から正解のたびに呼ぶ軽量版。
function acCheckStatsIntegrity() {
    try {
        if (typeof stats === 'undefined' || !stats) return;
        if (stats.correct > stats.total) { acReportViolation('correct-exceeds-total'); return; }
        if (stats.combo > stats.correct) { acReportViolation('combo-exceeds-correct'); return; }
        if (stats.score < 0) { acReportViolation('negative-score'); return; }
        if (stats.miss > stats.total) { acReportViolation('miss-exceeds-total'); return; }
    } catch(e) {
        console.error('[anticheat] 統計整合性チェック中にエラー:', e);
    }
}

// 3. 異常な入力間隔の検知。正解のたびに呼ぶ。
function acRecordHitAndCheckTiming() {
    try {
        const now = performance.now();
        acLastHitTimes.push(now);
        if (acLastHitTimes.length > 5) acLastHitTimes.shift();
        if (acLastHitTimes.length >= 5) {
            const span = acLastHitTimes[acLastHitTimes.length - 1] - acLastHitTimes[0];
            const avgInterval = span / (acLastHitTimes.length - 1);
            if (avgInterval < AC_MIN_HUMANLY_POSSIBLE_INTERVAL_MS) {
                acReportViolation('inhuman-typing-interval');
            }
        }
    } catch(e) {
        console.error('[anticheat] 入力間隔チェック中にエラー:', e);
    }
}

// 正解1回ごとにまとめて呼び出す入口(game.js/hud.jsからはこれだけ呼べばよい)
function acOnCorrectInput() {
    if (acViolationDetected) return;
    acCheckStatsIntegrity();
    acRecordHitAndCheckTiming();
}

// 新しいセッション開始時にリセットする
function acResetSession() {
    acViolationDetected = false;
    acLastHitTimes = [];
}
