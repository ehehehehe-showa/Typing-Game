/* ==========================================
   questions.js — 問題データの読み込み・登録を担当するローダー。
   ここには問題の中身は置かず、questions/ フォルダの各ファイルが
   registerQuestionSet() を呼んで自分自身を登録する方式にしている。

   ねらい:
   ・1問題セット=1ファイルにすることで、追加/一時停止/削除が
     index.htmlの<script>タグ1行を足す/コメントアウトする/消すだけで完結する
     (オンラインでの差し替えやデバッグがしやすい)
   ・questions.js本体を軽く保ち、問題ファイルは<script defer>で読み込むことで、
     アプリ本体の起動を問題データの量に引っ張られて遅くしない
   ・あるファイルの内容が壊れていても(構文エラー等)、他の<script>タグは
     独立して実行されるため、その1セットだけが読み込まれないだけで済む

   問題セットのフォーマット:
   {
     id, name, description, tags,
     is_cjk: true | false,   // ふりがな(読み)を必要とする言語かどうか
     forceSettings: {...},   // (任意) 競技用などモードを固定したい場合
     questions:
       is_cjk:true  → [{ text, kana }, ...]
         text/kanaはどちらも「|」区切りで、読みのまとまり単位を1:1で対応させる。
         例: "今日|は" / "きょう|は"  (「今日」を1文字ずつ分けると読みが不自然になるため
         2文字をまとめて1つの読みグループにできる)
       is_cjk:false → ["word1", "word2", ...] のようなプレーンな文字列配列
         (英単語など、ふりがな表示が不要な言語向け。文字そのものがそのまま入力対象になる)
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

// questions/*.js から呼ばれる登録関数。
// IDの欠落・重複や、questions配列が空といった明らかな不備はここで弾き、
// 1セットの不備が他のセットの登録やアプリ全体に影響しないようにする。
function registerQuestionSet(set) {
    try {
        if (!set || !set.id) { console.warn('registerQuestionSet: idの無い問題セットをスキップしました', set); return; }
        if (questionSets.some(s => s.id === set.id)) { console.warn(`registerQuestionSet: id "${set.id}" は既に登録済みのためスキップしました`); return; }
        if (!Array.isArray(set.questions) || set.questions.length === 0) { console.warn(`registerQuestionSet: "${set.id}" はquestionsが空のためスキップしました`); return; }
        questionSets.push(set);
    } catch(e) {
        console.error('registerQuestionSet: 登録中にエラーが発生しました', e);
    }
}
