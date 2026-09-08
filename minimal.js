/* styles/minimal.js — ネオン/走査線/切り欠きパネルを排したフラットなスタイル */
registerStyle({
    id: 'minimal',
    name: { en: 'Minimal', ja: 'ミニマル' },
    background: 'drift',
    glow: false,
    colors: {
        dark: {
            bgColor: '#14161a', panelBg: 'rgba(26, 28, 33, 0.95)', panelBorder: 'rgba(255, 255, 255, 0.08)',
            textColor: '#e6e6e6', textMuted: '#7a7f87', accentColor: '#6c8cff', accentHover: '#5877e6',
            accentGlow: 'rgba(108, 140, 255, 0.2)', accentRgb: '108, 140, 255', borderColor: 'rgba(255, 255, 255, 0.08)',
            inputBg: 'rgba(0, 0, 0, 0.25)', keyBg: 'rgba(255, 255, 255, 0.06)', errorColor: '#ff6b6b',
            fontMain: "'Segoe UI', 'Hiragino Sans', 'Helvetica Neue', Arial, sans-serif"
        },
        light: {
            bgColor: '#fafafa', panelBg: 'rgba(255, 255, 255, 0.97)', panelBorder: 'rgba(0, 0, 0, 0.08)',
            textColor: '#222222', textMuted: '#8a8f98', accentColor: '#3b5bdb', accentHover: '#2f4bc4',
            accentGlow: 'rgba(59, 91, 219, 0.12)', accentRgb: '59, 91, 219', borderColor: 'rgba(0, 0, 0, 0.08)',
            inputBg: 'rgba(0, 0, 0, 0.03)', keyBg: 'rgba(0, 0, 0, 0.04)', errorColor: '#e03131',
            fontMain: "'Segoe UI', 'Hiragino Sans', 'Helvetica Neue', Arial, sans-serif"
        }
    }
});
