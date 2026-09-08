/* ==========================================
   settings.js — ユーザー設定
   テーマ・言語・音量・リザルト表示項目の読み込みと保存を担当。
========================================== */

const defaultSettings = {
    theme: 'auto', styleTheme: 'cyber', lang: 'ja', volUi: 0.3, volHit: 0.5, volMiss: 0.5,
    resultToggles: { total: true, wpm: true, cpm: true, kpm: true, correct: true, miss: true, acc: true, err: true }
};

let savedSettings = {};
try { savedSettings = JSON.parse(localStorage.getItem('typingSettingsCyber')) || {}; } catch(e) {}
let appSettings = {
    ...defaultSettings, ...savedSettings,
    resultToggles: { ...defaultSettings.resultToggles, ...(savedSettings.resultToggles || {}) }
};

const resultStatsKeys = Object.keys(defaultSettings.resultToggles);
const supportedLangs = { ja: "日本語", en: "English" };

// ★設定画面の各項目を宣言的に定義する。新しい設定を増やしたいときは
// ここに1つオブジェクトを足すだけでよく、index.html/settings-screen.jsの
// 描画コードを直接編集する必要はない(questions/やstyles/と同じ考え方)。
const SETTINGS_SCHEMA = [
    {
        id: 'setting-lang', key: 'lang', type: 'select',
        label: 'setting_lang', tooltip: 'tooltip_lang',
        options: () => Object.keys(supportedLangs).map(k => ({ value: k, label: supportedLangs[k] })),
        onChange: (val) => { currentLang = val; applyTranslations(); }
    },
    {
        id: 'setting-theme', key: 'theme', type: 'select',
        label: 'setting_theme', tooltip: 'tooltip_theme',
        options: () => [
            { value: 'auto', label: t('theme_auto') },
            { value: 'dark', label: t('theme_dark') },
            { value: 'light', label: t('theme_light') }
        ],
        onChange: (val) => applyAppearance(appSettings.styleTheme, val)
    },
    {
        id: 'setting-style', key: 'styleTheme', type: 'select',
        label: 'setting_style', tooltip: 'tooltip_style',
        options: () => Object.keys(STYLE_THEMES).map(k => ({ value: k, label: getI18nText(STYLE_THEMES[k].name) })),
        onChange: (val) => applyAppearance(val, appSettings.theme)
    },
    {
        id: 'setting-vol-ui', key: 'volUi', type: 'range',
        label: 'vol_ui', tooltip: 'tooltip_vol', min: 0, max: 1, step: 0.05,
        onChange: null
    },
    {
        id: 'setting-vol-hit', key: 'volHit', type: 'range',
        label: 'vol_hit', tooltip: 'tooltip_vol', min: 0, max: 1, step: 0.05,
        onChange: () => playCyberSound('hit')
    },
    {
        id: 'setting-vol-miss', key: 'volMiss', type: 'range',
        label: 'vol_miss', tooltip: 'tooltip_vol', min: 0, max: 1, step: 0.05,
        onChange: () => playCyberSound('miss')
    }
];

function saveSettings() {
    localStorage.setItem('typingSettingsCyber', JSON.stringify(appSettings));
}
