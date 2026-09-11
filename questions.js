/* ==========================================
   questions.js — 問題データの読み込み・登録を担当するローダー。
   GitHub Pages配信に移行しfetch()が使えるようになったため、
   以前の<script>タグ動的生成方式からJSON+fetch方式に変更した。

   ねらい:
   ・1問題セット=1ファイル(questions/<id>.json)にすることは変わらず、
     questions/manifest.jsonのfiles配列に1行足すだけで追加できる
     (index.html自体は編集不要)
   ・1ファイルの取得/パース失敗が他のファイルの読み込みに影響しないよう、
     Promise.allSettled()で個別に結果を扱う
   ・「一問も読み込めなかった」場合(オフライン・manifestの構文ミス・
     ネットワーク遮断など、あらゆる失敗パターン)を必ず検知し、
     questionsReadyイベントで呼び出し側(script.js/mode-select.js)に
     知らせてフォールバックUIを出せるようにする。ここが今回いちばん
     大事なところ: 「失敗した」ことを黙って握りつぶさない。

   問題セットのフォーマット(questions/<id>.json):
   {
     id, version,            // versionを上げると、そのセットに紐づく
                              // 履歴/ベスト記録がリセットされる(records.js参照)
     name, description, tags,
     is_cjk: true | false,   // ふりがな(読み)を必要とする言語かどうか
     forceSettings: {...},   // (任意) 競技用などモードを固定したい場合
     questions:
       is_cjk:true  → [{ text, kana }, ...]  (text/kanaは同じ数の「|」区切り)
       is_cjk:false → ["word1", "word2", ...] のようなプレーンな文字列配列
   }
========================================== */

const TAG_DEFINITIONS = {
    word: { en: "Words", ja: "単語" },
    short: { en: "Short", ja: "短文" },
    long: { en: "Long", ja: "長文" },
    comp: { en: "Competition", ja: "競技用" },
    ja: { en: "Japanese", ja: "日本語" },
    en: { en: "English", ja: "英語" }
};

const questionSets = [];
let questionsLoadState = 'loading'; // 'loading' | 'ready' | 'empty'

// questions/*.json から呼ばれる登録関数。
// IDの欠落・重複や、questions配列が空といった明らかな不備はここで弾き、
// 1セットの不備が他のセットの登録やアプリ全体に影響しないようにする。
function registerQuestionSet(set) {
    try {
        if (!set || !set.id) { console.warn('registerQuestionSet: idの無い問題セットをスキップしました', set); return; }
        if (questionSets.some(s => s.id === set.id)) { console.warn(`registerQuestionSet: id "${set.id}" は既に登録済みのためスキップしました`); return; }
        if (!Array.isArray(set.questions) || set.questions.length === 0) { console.warn(`registerQuestionSet: "${set.id}" はquestionsが空のためスキップしました`); return; }
        try {
            // ★バージョン変更検知は本体機能ではないため、ここが失敗しても
            // 問題セット自体の登録は止めない(records.js未読み込み等への保険)
            if (typeof checkQuestionSetVersion === 'function') checkQuestionSetVersion(set);
        } catch(e) { console.error('registerQuestionSet: バージョン確認中にエラー', e); }
        questionSets.push(set);
    } catch(e) {
        console.error('registerQuestionSet: 登録中にエラーが発生しました', e);
    }
}

async function mpFetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
}

async function loadQuestionSets() {
    try {
        const manifest = await mpFetchJson('questions/manifest.json');
        const files = Array.isArray(manifest.files) ? manifest.files : [];
        if (files.length === 0) throw new Error('questions/manifest.json に files が見つかりません');

        const results = await Promise.allSettled(files.map(async (filename) => {
            const data = await mpFetchJson('questions/' + filename);
            registerQuestionSet(data);
        }));
        results.forEach((r, i) => {
            if (r.status === 'rejected') console.error(`[questions] questions/${files[i]} の読み込みに失敗しました:`, r.reason);
        });
    } catch (e) {
        // manifest自体が読めない(オフライン・パス間違い・JSON構文ミス等)。
        // ここで例外を投げっぱなしにせず、必ず後続の空チェックに進める。
        console.error('[questions] questions/manifest.json の読み込みに失敗しました:', e);
    } finally {
        questionsLoadState = questionSets.length > 0 ? 'ready' : 'empty';
        // ★成功・失敗を問わず必ず1回発火する。UI側はこれだけを見れば良い。
        try {
            window.dispatchEvent(new CustomEvent('questionsReady', { detail: { count: questionSets.length, state: questionsLoadState } }));
        } catch(e) { console.error('[questions] questionsReadyイベントの発火に失敗しました:', e); }
    }
}

const questionsLoadPromise = loadQuestionSets();
