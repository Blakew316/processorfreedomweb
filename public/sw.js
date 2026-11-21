// Shows new-order notifications, even when Processor Freedom Sites is closed.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* plain text */ }
  e.waitUntil(self.registration.showNotification(d.title || 'New order', { body: d.body || '', icon: '/assets/logo.png', badge: '/assets/logo.png', tag: d.tag, data: { url: d.url || '/app' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url || '/app';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.includes('/app'));
    return open ? open.focus().then((c) => c.navigate(url)) : self.clients.openWindow(url);
  }));
});
