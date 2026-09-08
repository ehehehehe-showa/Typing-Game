/* ==========================================
   audio.js — 効果音の再生 (Web Audio API)
   CYBER_AUDIO_DATAの各キーの値は2通りの書き方に対応する:
     ・数値(Hz)   → その場でオシレーターにより合成した短いビープ音を鳴らす
     ・文字列(パス) → 相対パス(または data: URI)の音声ファイルを読み込んで再生する
   例:
     hit: 880              // 880Hzのビープ
     hit: "sounds/hit.mp3" // 自前の音声ファイルに差し替え
   カスタマイズしたい人はこのオブジェクトの値を書き換えるだけでよい。

   再生方式そのものはWeb Audio APIベース: ファイル音源は起動時に一度だけ
   AudioBufferへデコードしておき、再生のたびに軽量な使い捨てAudioBufferSourceNode
   を生成する(HTMLAudioElementのプールを使い回すより低コストで、連打しても
   自然に音が重なる)。
========================================== */

const CYBER_AUDIO_DATA = {
    hover: 660,
    click: 440,
    hit: 880,
    miss: 180
};

class CyberAudioManager {
    constructor() {
        this.ctx = null;
        this.buffers = {}; // ファイル音源(デコード済みAudioBuffer)
        this.tones = {};   // 数値指定音源の周波数(Hz)
        this.gains = {};
        this.initPromise = null;
    }

    // AudioContextの生成とデコードは一度だけ非同期で行う。
    // 生成自体はユーザー操作なしでも許可されているため、ページ読み込み時に
    // 前もって呼んでおき、実際の再生(start)だけがユーザー操作後になるようにする。
    init() {
        if (this.initPromise) return this.initPromise;
        this.initPromise = (async () => {
            try {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();

                ['ui', 'hit', 'miss'].forEach(ch => {
                    const g = this.ctx.createGain();
                    g.connect(this.ctx.destination);
                    this.gains[ch] = g;
                });

                await Promise.all(Object.keys(CYBER_AUDIO_DATA).map(async (key) => {
                    const val = CYBER_AUDIO_DATA[key];
                    if (typeof val === 'number') {
                        this.tones[key] = val;
                        return;
                    }
                    // 文字列は音声ファイルの相対パス(またはdata:URI)として読み込む
                    const res = await fetch(val);
                    const arrayBuffer = await res.arrayBuffer();
                    this.buffers[key] = await this.ctx.decodeAudioData(arrayBuffer);
                }));
                console.log("Audio Engine Ready.");
            } catch(e) {
                console.error("Audio Init Failed:", e);
            }
        })();
        return this.initPromise;
    }

    play(type, settings = {}) {
        if (!this.initPromise) { this.init(); return; } // 初回呼び出しはデコード開始のみ
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const volUi = settings.volUi !== undefined ? settings.volUi : 0.3;
        const volHit = settings.volHit !== undefined ? settings.volHit : 0.5;
        const volMiss = settings.volMiss !== undefined ? settings.volMiss : 0.5;

        const channel = (type === 'hover' || type === 'click') ? 'ui' : (type === 'hit' ? 'hit' : 'miss');
        const vol = channel === 'ui' ? volUi : (channel === 'hit' ? volHit : volMiss);
        if (this.gains[channel]) this.gains[channel].gain.value = vol;

        if (this.buffers[type]) {
            const source = this.ctx.createBufferSource();
            source.buffer = this.buffers[type];
            source.connect(this.gains[channel]);
            source.start(0);
        } else if (this.tones[type] !== undefined) {
            // Hz指定音源: オシレーターでその場で合成する。
            // 減衰エンベロープをつけて「プツッ」というクリックノイズを防ぐ。
            const osc = this.ctx.createOscillator();
            const envelope = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = this.tones[type];
            const now = this.ctx.currentTime;
            envelope.gain.setValueAtTime(0.0001, now);
            envelope.gain.exponentialRampToValueAtTime(1, now + 0.005);
            envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
            osc.connect(envelope);
            envelope.connect(this.gains[channel]);
            osc.start(now);
            osc.stop(now + 0.13);
        }
    }
}

const audioManager = new CyberAudioManager();

function playCyberSound(type) {
    const settings = typeof appSettings !== 'undefined' ? appSettings : {};
    audioManager.play(type, settings);
}
