self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open('medix-cache-v1').then((cache) => {
            return cache.addAll(['./index.html', './logo.png']);
        })
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => {
            return response || fetch(e.request);
        })
    );
});
