/* Viáticos · service worker
   Deja abrir la app sin señal: guarda la última versión de cada
   archivo propio y, si la red no responde, sirve esa. Primero la red,
   para que una versión nueva se vea en cuanto se publica. Las llamadas
   a la base (supabase.co) no pasan por aquí. */
const VERSION = '1.3';
const CACHE = 'viaticos-' + VERSION;
const BASICOS = ['./', 'index.html', 'config.js', 'app.js', 'estilos.css', 'tipografia.css', 'manifest.webmanifest', 'icono-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })
      .then(r => r || caches.match('index.html')))
  );
});
