/* ==========================================
   background.js — 背景演出
   スタイル(theme.jsのSTYLE_THEMES)ごとに異なる背景キャンバスを描画する。
   ・cyber   → マトリックス風の文字落ち
   ・minimal → 落ち着いた浮遊パーティクル
   以前は「ゲームプレイ中は負荷軽減のため描画を止める」実装だったが、
   これはユーザー体験として不自然(タイピング中も背景が動いていてほしい)
   だったため撤回し、常時描画するようにした。負荷面はsetIntervalではなく
   requestAnimationFrameで描画タイミングをブラウザに委ねることで担保する。
========================================== */

function initMatrixBackground() {
    const canvas = document.getElementById('bg-canvas'); const ctx = canvas.getContext('2d');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ'.split('');
    const fontSize = 14;
    let drops = [];
    let particles = [];
    let rafId = null;

    function setupCanvas() {
        canvas.width = window.innerWidth; canvas.height = window.innerHeight;
        const columns = Math.ceil(canvas.width / fontSize);
        drops = new Array(columns).fill(1);
        const count = Math.floor((canvas.width * canvas.height) / 18000);
        particles = Array.from({ length: count }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: 1 + Math.random() * 2,
            speedY: 0.1 + Math.random() * 0.3,
            speedX: (Math.random() - 0.5) * 0.15,
            alpha: 0.15 + Math.random() * 0.25
        }));
    }
    setupCanvas();

    function currentBackgroundKind() {
        const style = (typeof appSettings !== 'undefined' && appSettings.styleTheme) || 'cyber';
        return (typeof STYLE_THEMES !== 'undefined' && STYLE_THEMES[style]) ? STYLE_THEMES[style].background : 'matrix';
    }

    // ★以前はsetInterval(33ms間隔=約30fps)で1回呼ばれるごとに1マス分動かしていたが、
    // requestAnimationFrameは画面のリフレッシュレートに同期して呼ばれるため、
    // 60Hz/120Hzなど高リフレッシュレートのモニタでは呼ばれる回数そのものが増え、
    // その分だけ見た目の速度が(モニタによって)速くなってしまっていた。
    // 前回描画からの実経過時間(deltaTime)を測り、「33ms相当あたり何マス動くか」を
    // 基準に正規化することで、モニタのリフレッシュレートに関わらず同じ体感速度になる。
    const BASE_FRAME_MS = 1000 / 30;
    let lastTime = performance.now();

    function drawMatrix(steps) {
        const isLight = document.body.classList.contains('theme-light');
        ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--accent-color').trim() || '#0F0';
        ctx.font = fontSize + 'px monospace';
        for(let i = 0; i < drops.length; i++) {
            const text = chars[Math.floor(Math.random() * chars.length)];
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);
            if(drops[i] * fontSize > canvas.height && Math.random() > (1 - 0.025 * steps)) drops[i] = 0;
            drops[i] += steps;
        }
    }

    // ミニマルスタイル用: ゆっくり漂う静かなパーティクル(サイバー感のない演出)
    function drawDrift(steps) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const accent = getComputedStyle(document.body).getPropertyValue('--accent-color').trim() || '#888';
        particles.forEach(p => {
            p.y -= p.speedY * steps; p.x += p.speedX * steps;
            if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = accent;
            ctx.globalAlpha = p.alpha;
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    function draw(now) {
        const steps = Math.min(4, (now - lastTime) / BASE_FRAME_MS); // 極端なタブ復帰直後の飛びすぎ防止に上限を設ける
        lastTime = now;
        if (currentBackgroundKind() === 'drift') drawDrift(steps); else drawMatrix(steps);
        rafId = requestAnimationFrame(draw);
    }
    rafId = requestAnimationFrame((t) => { lastTime = t; rafId = requestAnimationFrame(draw); });
    window.addEventListener('resize', setupCanvas);
}
