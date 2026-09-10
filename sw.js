const CACHE_VERSION = 'medix-cache-v2';

const APP_SHELL = [
    './',
    './index.html',
    './logo.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key !== CACHE_VERSION)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;

    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Hanya intercept resource dari domain MEDIX sendiri.
    if (url.origin !== self.location.origin) return;

    // HTML: network-first agar versi MEDIX terbaru tidak tertahan cache.
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_VERSION)
                        .then((cache) => cache.put('./index.html', copy))
                        .catch(() => {});
                    return response;
                })
                .catch(() => caches.match(request)
                    .then((cached) => cached || caches.match('./index.html')))
        );
        return;
    }

    // Asset lainnya: cache-first.
    event.respondWith(
        caches.match(request)
            .then((cached) => {
                if (cached) return cached;

                return fetch(request).then((response) => {
                    if (!response || !response.ok) return response;

                    const copy = response.clone();
                    caches.open(CACHE_VERSION)
                        .then((cache) => cache.put(request, copy))
                        .catch(() => {});
                    return response;
                });
            })
    );
});
