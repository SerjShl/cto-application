const response = await fetch('/config.json', { cache: 'no-store' })
if (!response.ok) throw new Error('Runtime configuration is unavailable')
window.__APP_CONFIG__ = await response.json()
await import('./main.jsx')
