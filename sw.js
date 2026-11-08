/* Viáticos · service worker
   Deja abrir la app sin señal: guarda la última versión de cada
   archivo propio y, si la red no responde, sirve esa. Primero la red,
   para que una versión nueva se vea en cuanto se publica. Las llamadas
   a la base (supabase.co) no pasan por aquí. */
const VERSION = '1.4';
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
  // Con datos lentos no se espera a la red más de 5 s si ya hay copia
  // guardada: se abre con la copia y la red, cuando llegue, la renueva.
  const red = fetch(e.request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
    return r;
  });
  const copia = () => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'));
  e.respondWith(new Promise(listo => {
    let hecho = false;
    const dar = r => { if (!hecho && r) { hecho = true; listo(r); } };
    const t = setTimeout(() => copia().then(dar), 5000);
    red.then(r => { clearTimeout(t); dar(r); })
       .catch(() => { clearTimeout(t); copia().then(r => dar(r || Response.error())); });
  }));
  e.waitUntil(red.catch(() => { }));
});
