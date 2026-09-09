/* ==========================================
   screens/play-select.js — 「問題を選択」画面
   検索・タグ絞り込み・セット選択・SETUP画面(モード/目標値)のフォーム制御。
========================================== */

let activeTagFilters = {};
Object.keys(TAG_DEFINITIONS).forEach(tag => activeTagFilters[tag] = false);

let selectedQSetId = null;

function initTagFilters() {
    const container = document.getElementById('tag-filters');
    if (!container) return;
    container.innerHTML = "";
    Object.keys(TAG_DEFINITIONS).forEach(tagKey => {
        const lbl = document.createElement('label');
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = activeTagFilters[tagKey];
        chk.onchange = (e) => {
            activeTagFilters[tagKey] = e.target.checked;
            playCyberSound('click');
            renderQuestionSets();
        };
        lbl.appendChild(chk);
        const span = document.createElement('span');
        span.innerText = getI18nText(TAG_DEFINITIONS[tagKey]);
        lbl.appendChild(span);
        container.appendChild(lbl);
    });
}

function renderQuestionSets() {
    const container = document.getElementById('qset-list');
    const searchInput = document.getElementById('search-input');
    const searchWord = searchInput ? searchInput.value.toLowerCase() : "";
    const requiredTags = Object.keys(activeTagFilters).filter(k => activeTagFilters[k]);

    let html = "";
    questionSets.forEach(set => {
        const name = getI18nText(set.name);
        const desc = getI18nText(set.description);

        if (searchWord && !name.toLowerCase().includes(searchWord) && !desc.toLowerCase().includes(searchWord)) return;

        if (requiredTags.length > 0) {
            const hasAllTags = requiredTags.every(tag => set.tags && set.tags[tag]);
            if (!hasAllTags) return;
        }

        let tagsHtml = "";
        if (set.tags) {
            Object.keys(set.tags).forEach(tk => {
                if (set.tags[tk]) tagsHtml += `<span class="qset-tag">${getI18nText(TAG_DEFINITIONS[tk])}</span>`;
            });
        }

        html += `
            <div class="qset-card" onclick="selectQuestionSet('${set.id}')">
                <h3>${name}</h3>
                <p>${desc}</p>
                <div class="qset-tags">${tagsHtml}</div>
            </div>
        `;
    });

    if (html === "") html = `<p class="qset-empty-message">No sets found.</p>`;
    container.innerHTML = html;
}

function selectQuestionSet(id) {
    selectedQSetId = id;

    const set = questionSets.find(s => s.id === id) || questionSets[0];
    document.getElementById('setup-qset-name').innerText = getI18nText(set.name);
    document.getElementById('setup-qset-desc').innerText = getI18nText(set.description);

    updateFormUI();
    openScreen('play-setup');
}

function retryPlay() {
    // ★マルチプレイの対戦はホスト/参加のやり直しが必要なため、そのまま
    // play-setupには戻れない。メインメニューに戻す(接続もそこで切断される)。
    if (typeof mpIsMultiplayer !== 'undefined' && mpIsMultiplayer) { backToMain(); return; }
    openScreen('play-setup');
}

function updateFormUI() {
    const set = questionSets.find(s => s.id === selectedQSetId) || questionSets[0];
    const customArea = document.getElementById('custom-settings-area');
    const forcedArea = document.getElementById('forced-settings-area');
    customArea.classList.toggle('hidden', !!set.forceSettings);
    forcedArea.classList.toggle('hidden', !set.forceSettings);
    if (set.forceSettings) {
        const modeTxt = set.forceSettings.mode === 'time' ? t('play_target_time') : t('play_target_amount');
        document.getElementById('forced-info-text').innerText = `${modeTxt} : ${set.forceSettings.target}`;
    } else {
        document.getElementById('label-play-target').innerText = document.getElementById('play-mode').value === 'time' ? t('play_target_time') : t('play_target_amount');
    }
    // ★途中参加の可否チェックボックスはマルチプレイのホスト時のみ意味を持つ
    document.getElementById('mp-setup-options').classList.toggle('hidden', mpMode !== 'host');
}
