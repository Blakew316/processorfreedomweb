// Shows new-order notifications, even when Processor Freedom Sites is closed.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* plain text */ }
  e.waitUntil(self.registration.showNotification(d.title || 'New order', { body: d.body || '', icon: '/assets/icon-192.png', badge: '/assets/icon-192.png', tag: d.tag, data: { url: d.url || '/app' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url || '/app';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.includes('/app'));
    return open ? open.focus().then((c) => c.navigate(url)) : self.clients.openWindow(url);
  }));
});

// If the service is restarting, show a short "back in a moment" page that reloads itself, not a raw error.
const WAIT = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>One moment…</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;background:#fff;color:#1d1d1f;text-align:center;padding:24px}h1{font-size:30px;letter-spacing:-.025em;margin:18px 0 8px;font-weight:600}p{color:#6e6e73;font-size:17px;margin:0}i{display:block;width:26px;height:26px;margin:0 auto;border:2.5px solid #e8e8ed;border-top-color:#0a1f44;border-radius:50%;animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style></head><body><div><i></i><h1 id="t">Just a moment</h1><p id="m">We’re updating. This page will come back on its own.</p></div><script>if(navigator.onLine===false){document.getElementById('t').textContent='You’re offline';document.getElementById('m').textContent='Check your connection. This page will come back on its own.';addEventListener('online',function(){location.reload()});setTimeout(function(){location.reload()},15000)}else{setTimeout(function(){location.reload()},3500)}</script></body></html>`;
// The app's own files are kept on the device so it opens straight away from the Home Screen, even on a weak signal.
// The network is always tried first, so an update is never held back by an old copy.
const SHELL = 'pf-shell-v22';
const keep = (req, res) => { if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {}); } return res; };
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const waiting = () => new Response(WAIT, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  if (req.mode === 'navigate') {
    const app = url.pathname === '/' || /^\/(login|signup|forgot|reset|app(\/.*)?)$/.test(url.pathname);
    e.respondWith(fetch(req).then((r) => ([502, 503, 504].includes(r.status) ? waiting() : app ? keep('/app-shell', r) : r))
      .catch(() => (app ? caches.match('/app-shell').then((hit) => hit || waiting()) : waiting())));
    return;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/shared/')) {
    e.respondWith(fetch(req).then((r) => keep(req, r)).catch(() => caches.match(req).then((hit) => hit || Response.error())));
  }
});
