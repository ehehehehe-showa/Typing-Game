/* ==========================================
   records.js — プレイ履歴・ベスト記録の永続化
   localStorageへの読み書きはここに閉じ込め、他のファイルからは
   saveRecord() / getHistory() / getBest() 経由でのみアクセスする。
   （実績システムなどを追加するときも、まずここにフックすればよい）

   ★保存ポリシー: forceSettings(競技ルール)が有効な問題セットの結果だけを
   履歴/ベスト記録として保存する。カスタム設定(モード・目標値を自由に選べる)
   のセットは対戦条件が揃っていないため、対照実験として成立せず、記録として
   比較する意味が無い、という考え方に基づく。この判定はsaveRecord()側で
   一元的に行い、呼び出し側が判定を忘れても記録が紛れ込まないようにしている。

   ★バージョン管理: 問題セットのJSONにversionフィールドを持たせており、
   前回保存したバージョンと異なる場合は「問題内容そのものが変わった」と
   みなし、そのセットに紐づく履歴/ベスト記録をリセットする
   (内容が変わった後の記録を、変更前の記録と混ぜて比較しないため)。
========================================== */

const MAX_HISTORY = 50;
const QSET_VERSION_KEY_PREFIX = 'typingQSetVersion_';

let playHistoryAll = {};
try { playHistoryAll = JSON.parse(localStorage.getItem('typingHistoryCyber_v2')) || {}; } catch(e) { console.error('[records] 履歴の読み込みに失敗しました:', e); playHistoryAll = {}; }
let bestStatusAll = {};
try { bestStatusAll = JSON.parse(localStorage.getItem('typingBestCyber_v2')) || {}; } catch(e) { console.error('[records] ベスト記録の読み込みに失敗しました:', e); bestStatusAll = {}; }

function persistHistory() {
    try { localStorage.setItem('typingHistoryCyber_v2', JSON.stringify(playHistoryAll)); }
    catch(e) { console.error('[records] 履歴の保存に失敗しました(ストレージ容量/プライベートモード等):', e); }
}

function persistBest() {
    try { localStorage.setItem('typingBestCyber_v2', JSON.stringify(bestStatusAll)); }
    catch(e) { console.error('[records] ベスト記録の保存に失敗しました:', e); }
}

// 問題セットのversionが前回保存時と異なれば、そのセットの履歴/ベストをリセットする。
// versionフィールドが無いセットは対象外(後方互換のため何もしない)。
function checkQuestionSetVersion(set) {
    if (!set || !set.id || set.version === undefined || set.version === null) return;
    const key = QSET_VERSION_KEY_PREFIX + set.id;
    let storedVersion = null;
    try { storedVersion = localStorage.getItem(key); } catch(e) { console.error('[records] バージョン情報の読み込みに失敗しました:', e); return; }

    if (storedVersion !== null && storedVersion !== String(set.version)) {
        delete playHistoryAll[set.id];
        delete bestStatusAll[set.id];
        persistHistory();
        persistBest();
        console.warn(`[records] 問題セット"${set.id}"のバージョンが変わったため(${storedVersion} → ${set.version})、履歴/ベスト記録をリセットしました`);
    }
    try { localStorage.setItem(key, String(set.version)); } catch(e) { console.error('[records] バージョン情報の保存に失敗しました:', e); }
}

// 1プレイ分の結果を履歴とベスト記録に保存する。
// setを渡さない/forceSettingsが無いセットの結果は保存しない(上記ポリシー参照)。
function saveRecord(categoryId, record, set) {
    try {
        if (!set || !set.forceSettings) return;
        if (!categoryId || !record) return;

        if (!playHistoryAll[categoryId]) playHistoryAll[categoryId] = [];
        playHistoryAll[categoryId].push(record);
        if (playHistoryAll[categoryId].length > MAX_HISTORY) playHistoryAll[categoryId].shift();
        persistHistory();

        if (!bestStatusAll[categoryId] || record.score > bestStatusAll[categoryId].score) {
            bestStatusAll[categoryId] = record;
            persistBest();
        }
    } catch(e) {
        console.error('[records] 記録の保存中にエラーが発生しました:', e);
    }
}

function getHistory(categoryId) {
    try { return playHistoryAll[categoryId] || []; }
    catch(e) { console.error('[records] 履歴の取得に失敗しました:', e); return []; }
}

function getBest(categoryId) {
    try { return bestStatusAll[categoryId] || null; }
    catch(e) { console.error('[records] ベスト記録の取得に失敗しました:', e); return null; }
}
