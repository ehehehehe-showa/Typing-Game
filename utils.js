/* ==========================================
   utils.js — 汎用ユーティリティ
   特定の機能に依存しない、単体で完結する便利関数だけを置く場所。
========================================== */

// 配列をその場でシャッフルする（Fisher-Yates）
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}
