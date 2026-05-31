import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Jarvis OS — AB Command Center',
    short_name: 'JARVIS',
    description: 'AB personal AI command center',
    start_url: '/',
    display: 'standalone',
    background_color: '#020810',
    theme_color: '#00d4ff',
    orientation: 'landscape',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Morning Brief', url: '/?cmd=morning+brief', description: 'Get your morning brief' },
      { name: 'Portfolio', url: '/?cmd=portfolio+summary', description: 'Check portfolio' },
      { name: 'Training', url: '/?cmd=whats+my+training+today', description: 'Todays workout' },
    ],
    categories: ['productivity', 'finance', 'utilities'],
  }
}
