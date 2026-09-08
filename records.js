/* ==========================================
   records.js — プレイ履歴・ベスト記録の永続化
   localStorageへの読み書きはここに閉じ込め、他のファイルからは
   saveRecord() / getHistory() / getBest() 経由でのみアクセスする。
   （実績システムなどを追加するときも、まずここにフックすればよい）
========================================== */

const MAX_HISTORY = 50;

let playHistoryAll = {};
try { playHistoryAll = JSON.parse(localStorage.getItem('typingHistoryCyber_v2')) || {}; } catch(e) {}
let bestStatusAll = {};
try { bestStatusAll = JSON.parse(localStorage.getItem('typingBestCyber_v2')) || {}; } catch(e) {}

// 1プレイ分の結果を履歴とベスト記録に保存する
function saveRecord(categoryId, record) {
    if (!playHistoryAll[categoryId]) playHistoryAll[categoryId] = [];
    playHistoryAll[categoryId].push(record);
    if (playHistoryAll[categoryId].length > MAX_HISTORY) playHistoryAll[categoryId].shift();
    localStorage.setItem('typingHistoryCyber_v2', JSON.stringify(playHistoryAll));

    if (!bestStatusAll[categoryId] || record.score > bestStatusAll[categoryId].score) {
        bestStatusAll[categoryId] = record;
        localStorage.setItem('typingBestCyber_v2', JSON.stringify(bestStatusAll));
    }
}

function getHistory(categoryId) {
    return playHistoryAll[categoryId] || [];
}

function getBest(categoryId) {
    return bestStatusAll[categoryId] || null;
}
