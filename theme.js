/* ==========================================
   theme.js — 配色スタイルの読み込み・登録・適用を担当するローダー。
   questions.js/questions/フォルダと同じ考え方で、個々のスタイルの中身は
   置かず、styles/フォルダの各ファイルが registerStyle() を呼んで登録する。

   スタイルの配色はCSSを一切書き換えずにJSからCSS変数として直接bodyに
   適用するため、新しいスタイルを追加したいときはCSSを触らずstyles/に
   1ファイル追加してSTYLE_FILES配列(このファイルの下の方)に1行足すだけでよい
   (1スタイル=1ファイル、questions/と同じ運用。index.html自体は編集不要)。

   スタイルの登録フォーマット:
   {
     id, name: {en, ja},
     background: "matrix" | "drift",  // background.js側の描画レンダラー名
     glow: true | false,              // false にするとネオン/走査線/切り欠き
                                       // パネルなど"サイバー感"のある演出を一括オフにする
     colors: {
       dark:  { bgColor, panelBg, panelBorder, textColor, textMuted,
                accentColor, accentHover, accentGlow, accentRgb,
                borderColor, inputBg, keyBg, errorColor, fontMain },
       light: { ...同じキー... }
     }
   }
========================================== */

const STYLE_THEMES = {};

// styles/*.js から呼ばれる登録関数
function registerStyle(style) {
    try {
        if (!style || !style.id) { console.warn('registerStyle: idの無いスタイルをスキップしました', style); return; }
        if (!style.colors || !style.colors.dark) { console.warn(`registerStyle: "${style.id}" はcolors.darkが無いためスキップしました`); return; }
        STYLE_THEMES[style.id] = style;
    } catch(e) {
        console.error('registerStyle: 登録中にエラーが発生しました', e);
    }
}

// JSのプロパティ名 → 実際のCSSカスタムプロパティ名の対応表
const STYLE_CSS_VAR_MAP = {
    bgColor: '--bg-color', panelBg: '--panel-bg', panelBorder: '--panel-border',
    textColor: '--text-color', textMuted: '--text-muted', accentColor: '--accent-color',
    accentHover: '--accent-hover', accentGlow: '--accent-glow', accentRgb: '--accent-rgb',
    borderColor: '--border-color', inputBg: '--input-bg', keyBg: '--key-bg',
    errorColor: '--error-color', fontMain: '--font-main'
};

// 現在選択中のスタイル(styleId)と色モード(dark/light/auto)から、
// 実際の配色をCSS変数としてbodyへ直接適用する。テーマ・スタイルどちらの
// 変更でもこの1関数を呼べば見た目が揃うようにしている。
function applyAppearance(styleId, colorMode) {
    const style = STYLE_THEMES[styleId] || STYLE_THEMES[Object.keys(STYLE_THEMES)[0]];
    if (!style) return;

    const resolvedMode = colorMode === 'auto'
        ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : colorMode;
    const palette = style.colors[resolvedMode] || style.colors.dark;

    Object.keys(palette).forEach(key => {
        const cssVar = STYLE_CSS_VAR_MAP[key];
        if (cssVar) document.body.style.setProperty(cssVar, palette[key]);
    });

    document.body.classList.toggle('no-glow', style.glow === false);
    document.body.classList.remove('theme-dark', 'theme-light', 'theme-auto');
    document.body.classList.add(`theme-${resolvedMode}`);
}

// ★questions.jsと同じ考え方: 新しいスタイルを追加するときにindex.htmlへ
// <script>タグを足す必要が無いよう、ここでファイル名の一覧から動的に
// <script>タグを生成して読み込む。追加したいときはstyles/にファイルを作り、
// この配列に1行足すだけでよい。
const STYLE_FILES = [
    'cyber.js',
    'minimal.js'
];

STYLE_FILES.forEach(filename => {
    const script = document.createElement('script');
    script.src = 'styles/' + filename;
    document.head.appendChild(script);
});
