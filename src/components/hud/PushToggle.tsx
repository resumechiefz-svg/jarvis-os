'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff } from 'lucide-react'

export default function PushToggle() {
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setSubscribed(!!sub)
        })
      })
    }
  }, [])

  async function toggle() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications not supported. Use Chrome.')
      return
    }
    setLoading(true)

    try {
      const reg = await navigator.serviceWorker.ready

      if (subscribed) {
        const sub = await reg.pushManager.getSubscription()
        await sub?.unsubscribe()
        setSubscribed(false)
      } else {
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        })

        await fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'subscribe', subscription: sub }),
        })

        setSubscribed(true)

        // Test notification
        await fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'notify',
            title: 'JARVIS OS',
            message: 'Push notifications active. I\'ll reach you when it matters, AB.',
            tag: 'setup',
          }),
        })
      }
    } catch (err) {
      console.error('[Push]', err)
    } finally {
      setLoading(false)
    }
  }

  // Register service worker on mount
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error)
    }
  }, [])

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-1.5 px-2 py-0.5 border text-[9px] tracking-wider uppercase transition-colors ${
        subscribed
          ? 'border-green-700/50 text-green-400 bg-green-900/10'
          : 'border-white/10 text-white/30 hover:border-cyan-700 hover:text-cyan-400'
      }`}
      title={subscribed ? 'Push notifications ON' : 'Enable push notifications'}
    >
      {subscribed ? <Bell size={10} /> : <BellOff size={10} />}
      {loading ? '...' : subscribed ? 'Notifs ON' : 'Enable Notifs'}
    </button>
  )
}
