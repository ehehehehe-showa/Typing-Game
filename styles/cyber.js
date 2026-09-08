/* styles/cyber.js — サイバーパンクスタイル(既定) */
registerStyle({
    id: 'cyber',
    name: { en: 'Cyberpunk', ja: 'サイバーパンク' },
    background: 'matrix',
    glow: true,
    colors: {
        dark: {
            bgColor: '#050505', panelBg: 'rgba(10, 10, 12, 0.85)', panelBorder: 'rgba(0, 255, 204, 0.3)',
            textColor: '#e0f2fe', textMuted: '#4b5563', accentColor: '#00ffcc', accentHover: '#00e6b8',
            accentGlow: 'rgba(0, 255, 204, 0.6)', accentRgb: '0, 255, 204', borderColor: 'rgba(0, 255, 204, 0.2)',
            inputBg: 'rgba(0, 0, 0, 0.6)', keyBg: 'rgba(20, 20, 25, 0.9)', errorColor: '#ff0055',
            fontMain: "'Courier New', Courier, monospace"
        },
        light: {
            bgColor: '#f5f8fa', panelBg: 'rgba(255, 255, 255, 0.9)', panelBorder: 'rgba(0, 168, 255, 0.4)',
            textColor: '#333333', textMuted: '#8899a6', accentColor: '#00a8ff', accentHover: '#0097e6',
            accentGlow: 'rgba(0, 168, 255, 0.4)', accentRgb: '0, 168, 255', borderColor: 'rgba(0, 168, 255, 0.2)',
            inputBg: 'rgba(240, 248, 255, 0.9)', keyBg: 'rgba(255, 255, 255, 0.95)', errorColor: '#ff4757',
            fontMain: "'Courier New', Courier, monospace"
        }
    }
});
