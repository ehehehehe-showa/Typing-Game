/* ==========================================
   service-worker.js — PWAのオフライン対応。
   戦略: 「ネットワーク優先、失敗したらキャッシュ」。
   ・オンライン時は常に最新のファイル(特に問題データ)を優先して取得し、
     取得できたものはキャッシュも更新しておく
   ・オフライン時、またはネットワークが失敗した場合はキャッシュから返す
   ・キャッシュにも無ければ、最悪index.htmlだけは返す(SPA的なフォールバック)

   ★バージョンを上げる(CACHE_NAME を変える)と、新しいキャッシュが作られ、
   activate時に古いキャッシュが破棄される。ファイル構成を変えたときは
   このバージョン文字列を更新すること。
========================================== */

const CACHE_NAME = 'typingmaster-pro-v1';

const CORE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './utils.js',
    './lang.js',
    './settings.js',
    './records.js',
    './audio.js',
    './fallback.js',
    './anticheat.js',
    './multiplayer.js',
    './questions.js',
    './typing-engine.js',
    './theme.js',
    './layout.js',
    './hud.js',
    './navigation.js',
    './background.js',
    './game.js',
    './script.js',
    './screens/play-select.js',
    './screens/settings-screen.js',
    './screens/status-screen.js',
    './screens/mode-select.js',
    './styles/cyber.js',
    './styles/minimal.js',
    './questions/manifest.json',
    './questions/words-ja-1.json',
    './questions/long-ja-1.json',
    './questions/words-en-1.json',
    './questions/score-ja-1.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // ★1ファイルの取得失敗で他の全てが巻き添えにならないよう、
            // addAll()(1つ失敗で全体が失敗する)ではなくPromise.allSettledで個別に扱う
            return Promise.allSettled(CORE_ASSETS.map((url) =>
                cache.add(url).catch((e) => console.warn('[sw] キャッシュ失敗:', url, e))
            ));
        }).then(() => self.skipWaiting())
        .catch((e) => console.error('[sw] install中にエラー:', e))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
        ).then(() => self.clients.claim())
        .catch((e) => console.error('[sw] activate中にエラー:', e))
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request).then((networkResponse) => {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME)
                .then((cache) => cache.put(event.request, clone))
                .catch((e) => console.warn('[sw] キャッシュ更新に失敗:', e));
            return networkResponse;
        }).catch(() => {
            return caches.match(event.request).then((cached) => {
                if (cached) return cached;
                // ページ遷移的なリクエスト(HTML)で何も無ければ最低限index.htmlを返す
                if (event.request.mode === 'navigate') return caches.match('./index.html');
                return new Response('', { status: 504, statusText: 'Offline and not cached' });
            });
        })
    );
});
