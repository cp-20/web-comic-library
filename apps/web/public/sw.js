self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const url =
    typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/notifications';
  event.waitUntil(
    self.registration.showNotification('Web Comic Library', {
      body: '更新通知があります。',
      data: { url },
      icon: '/icon.svg',
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const requestedUrl =
    event.notification.data && typeof event.notification.data.url === 'string'
      ? event.notification.data.url
      : '/notifications';
  const url = requestedUrl.startsWith('/') ? requestedUrl : '/notifications';
  event.waitUntil(clients.openWindow(url));
});
