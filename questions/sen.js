/* questions/words-en-1.js — is_cjk:false 形式の動作サンプル(英単語練習)
   ふりがな不要な言語はこのようにプレーンな文字列配列で登録する。 */
registerQuestionSet({
    id: "sen_en_1",
    name: { en: "English Sentences Practice", ja: "英文練習" },
    description: { en: "Simple English word typing practice.", ja: "簡単な英文のタイピング練習です。" },
    tags: { word: false, short: true, long: false, comp: false, ja: false, en: true },
    is_cjk: false,
    questions: [
      "I like to kick balls.", "I like to play video games.", "It is easy for me to speak Japanese.", "Can you tell me what you want to do?",
      "Would you like something cold to drink?", "My name is Ken.", "Don't kick animals!", "What a cute cat!", "May I go to the bathroom?",
      "Sure.", "How are you today?", "I saw birds flying in the sky.", "I've been Kyoto more than three times."
    ]
});
