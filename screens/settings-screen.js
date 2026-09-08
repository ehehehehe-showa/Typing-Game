/* ==========================================
   screens/settings-screen.js — 「設定」画面
   実際の各設定項目の定義はsettings.jsのSETTINGS_SCHEMAにあり、
   ここではそれを読んでDOMを組み立てるだけにしている。
   新しい設定を増やす/減らすときはSETTINGS_SCHEMAを編集すればよく、
   このファイルを触る必要はない。
========================================== */

// SETTINGS_SCHEMAから設定画面の各項目(select/range)を生成する。
// 言語切り替え時など、選択肢の表示ラベルを翻訳し直す必要があるときは
// 現在の値を保ったまま呼び直せばよい(applyTranslations()から再呼び出しされる)。
function renderSettingsFields() {
    const container = document.getElementById('settings-fields');
    if (!container) return;
    container.innerHTML = '';

    SETTINGS_SCHEMA.forEach(field => {
        const wrap = document.createElement('div');
        wrap.className = 'form-group';
        if (field.tooltip) wrap.setAttribute('data-i18n-title', field.tooltip);
        wrap.title = t(field.tooltip);

        const label = document.createElement('label');
        label.setAttribute('data-i18n', field.label);
        label.innerText = t(field.label);
        wrap.appendChild(label);

        let input;
        if (field.type === 'select') {
            input = document.createElement('select');
            input.className = 'custom-select';
            field.options().forEach(opt => input.add(new Option(opt.label, opt.value)));
            input.value = appSettings[field.key];
            input.addEventListener('change', (e) => {
                appSettings[field.key] = e.target.value;
                saveSettings();
                if (field.onChange) field.onChange(e.target.value);
                playCyberSound('click');
            });
        } else if (field.type === 'range') {
            input = document.createElement('input');
            input.type = 'range';
            input.className = 'custom-range';
            input.min = field.min; input.max = field.max; input.step = field.step;
            input.value = appSettings[field.key];
            input.addEventListener('input', (e) => {
                appSettings[field.key] = parseFloat(e.target.value);
                saveSettings();
                if (field.onChange) field.onChange(e.target.value);
            });
        }
        input.id = field.id;
        wrap.appendChild(input);
        container.appendChild(wrap);
    });
}

// 設定画面の初期化処理。script.jsのwindow.onloadから一度だけ呼ばれる。
// SETTINGS_SCHEMAからの項目描画、実際の配色適用、リザルト表示チェックボックスの
// 初期値反映とイベント登録をまとめている。
function initSettingsScreen() {
    document.getElementById('play-mode').addEventListener('change', (e) => {
        document.getElementById('label-play-target').innerText = e.target.value === 'time' ? t('play_target_time') : t('play_target_amount');
    });

    renderSettingsFields();
    applyAppearance(appSettings.styleTheme, appSettings.theme);

    const toggleContainer = document.getElementById('result-toggles');
    resultStatsKeys.forEach(key => {
        const lbl = document.createElement('label');
        const chk = document.createElement('input');
        chk.type = 'checkbox'; chk.checked = appSettings.resultToggles[key];
        chk.onchange = (e) => { appSettings.resultToggles[key] = e.target.checked; saveSettings(); playCyberSound('click'); };
        lbl.appendChild(chk); lbl.appendChild(document.createTextNode(key.toUpperCase()));
        toggleContainer.appendChild(lbl);
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if(appSettings.theme === 'auto') applyAppearance(appSettings.styleTheme, 'auto');
    });
}
