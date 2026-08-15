/**
 * 离线推送 · 测试用 Service Worker
 * 收到 Web Push 时弹出系统通知；点击通知时聚焦/打开页面。
 */
self.addEventListener('push', (event) => {
  let data = { title: 'float', body: '你有一条新消息' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = {
        title: parsed.title || parsed.contactName || 'float',
        body: parsed.body || parsed.message || (typeof parsed === 'string' ? parsed : '你有一条新消息'),
      };
    }
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'offline-push',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
