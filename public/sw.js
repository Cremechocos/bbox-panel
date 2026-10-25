// Service worker : coquille de l'application disponible instantanément (réseau d'abord, jamais de cache pour les données).
const VERSION = 'mabbox-v3';
const SHELL = ['/', '/boot.js', '/styles.css', '/app.js', '/lib/ui.js', '/lib/api.js', '/lib/format.js', '/lib/icons.js', '/lib/chart.js', '/lib/live.js',
  '/lib/theme.js', '/lib/router.js', '/lib/routes.js', '/lib/prefs.js', '/lib/events.js', '/lib/palette.js', '/lib/alerts.js', '/lib/notify.js', '/lib/sheets.js',
  '/vendor/preact.mjs', '/vendor/hooks.mjs', '/vendor/htm.mjs', '/vendor/motion.js', '/vendor/qrcode.js',
  '/vendor/fonts/Geist-Variable.woff2', '/vendor/fonts/GeistMono-Variable.woff2', '/icons/icon.svg', '/icons/apple-touch-icon.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/panel/')) return; // jamais de cache pour les données (ni pour le flux temps réel)
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok && !url.search) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('/'))));
});

// Clic sur une notification du système : ramène le panel au premier plan sur la bonne page
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '#/activite', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => 'focus' in x);
    if (c) { c.navigate?.(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
