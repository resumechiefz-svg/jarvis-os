// Jarvis OS — Service Worker for Push Notifications

self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'JARVIS', {
      body: data.body ?? '',
      icon: '/jarvis-icon.png',
      badge: '/jarvis-badge.png',
      tag: data.tag ?? 'jarvis',
      data: { url: data.url ?? '/' },
      requireInteraction: data.urgent ?? false,
      silent: false,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
