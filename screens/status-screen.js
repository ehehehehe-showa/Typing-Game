/* ==========================================
   screens/status-screen.js — 「ステータス」画面
   履歴一覧・ベスト記録・スコア推移グラフ・詳細モーダルの表示。
   データそのものはrecords.jsのgetHistory()/getBest()から取得する。
========================================== */

function updateStatusCategoryOptions() {
    const statCatSel = document.getElementById('status-category');
    if (!statCatSel) return;
    const currentVal = statCatSel.value;
    statCatSel.innerHTML = "";
    // ★履歴はforceSettings(競技ルール)のセットしか保存されないため、
    // それ以外のセットを一覧に出しても常に空になるだけで意味が無い
    questionSets.filter(set => set.forceSettings).forEach((set, idx) => {
        const valueId = set.id || String(idx);
        statCatSel.add(new Option(getI18nText(set.name), valueId));
    });
    if (currentVal && Array.from(statCatSel.options).some(o => o.value === currentVal)) {
        statCatSel.value = currentVal;
    }
}

function renderStatusScreen() {
    setTimeout(() => {
        const catId = document.getElementById('status-category').value;
        const currentHist = getHistory(catId);
        const currentBest = getBest(catId);

        const listEl = document.getElementById('status-content');
        const bestEl = document.getElementById('best-status-content');
        const canvas = document.getElementById('score-chart');
        const wrapper = document.getElementById('chart-wrapper');

        canvas.width = wrapper.clientWidth; canvas.height = wrapper.clientHeight;
        const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);

        if(currentBest) {
            bestEl.innerHTML = `<div class="status-row" onclick='openModal(${JSON.stringify(currentBest.fullStats)})'><span class="neon-text">${currentBest.date}</span><span style="font-family:monospace">Score: <b class="neon-text">${currentBest.score.toLocaleString()}</b> | WPM: <b>${currentBest.wpm}</b> | Acc: <b>${currentBest.acc}</b></span></div>`;
        } else { bestEl.innerHTML = `<p style="text-align:center; color:var(--text-muted);">No Data</p>`; }

        if(currentHist.length === 0) { listEl.innerHTML = `<p style="text-align:center; color:var(--text-muted);">${t('status_empty')}</p>`; return; }

        let listHtml = '';
        [...currentHist].reverse().forEach(h => { listHtml += `<div class="status-row" onclick='openModal(${JSON.stringify(h.fullStats)})'><span>${h.date}</span><span style="font-family:monospace">Score: <b>${h.score.toLocaleString()}</b> | WPM: <b>${h.wpm}</b></span></div>`; });
        listEl.innerHTML = listHtml;

        const scores = currentHist.map(h => h.score); const maxScore = Math.max(...scores, 10);
        const paddingX = 20; const paddingY = 20; const width = canvas.width - paddingX * 2; const height = canvas.height - paddingY * 2;
        const accentColor = getComputedStyle(document.body).getPropertyValue('--accent-color').trim() || '#3b82f6';
        const bgColor = getComputedStyle(document.body).getPropertyValue('--panel-bg').trim() || '#1e293b';

        ctx.beginPath(); ctx.strokeStyle = accentColor; ctx.lineWidth = 3; ctx.lineJoin = 'round';
        scores.forEach((score, i) => {
            const x = paddingX + (i / Math.max(1, scores.length - 1)) * width; const y = paddingY + height - ((score / maxScore) * height);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }); ctx.stroke();

        ctx.fillStyle = '#000';
        scores.forEach((score, i) => {
            const x = paddingX + (i / Math.max(1, scores.length - 1)) * width; const y = paddingY + height - ((score / maxScore) * height);
            ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        });
    }, 50);
}

function openModal(statsObj) {
    playCyberSound('click');
    const grid = document.getElementById('modal-detail-grid');
    let html = '';
    resultStatsKeys.forEach(key => { html += `<div class="res-item"><span style="font-size:0.8rem; color:var(--text-muted)">${t('res_' + key)}</span><span class="res-val" style="font-size:1.5rem;">${statsObj[key]}</span></div>`; });
    grid.innerHTML = html;
    const modal = document.getElementById('status-modal');
    modal.classList.add('active');
    // ★以前はCSSの@keyframes fadeInで表示していたが、開閉のたびに
    // 毎回同じ短い演出をするだけなのでWeb Animations APIに統一した。
    modal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
}
function closeModal() { playCyberSound('click'); document.getElementById('status-modal').classList.remove('active'); }
