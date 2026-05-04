import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'

// Monaco cancels pending language-service operations whenever the editor model
// changes (e.g. on filesystem switch). Those cancellations surface as unhandled
// promise rejections OR (in React 18 dev mode) as re-thrown error events via
// invokeGuardedCallbackDev. Both are harmless Monaco internals — suppress them.
window.addEventListener('unhandledrejection', (event) => {
  const r = event.reason
  if (r === 'Canceled' ||
      (r != null && (r.name === 'Canceled' || r.message === 'Canceled' || String(r) === 'Canceled'))) {
    event.preventDefault()
  }
})
window.addEventListener('error', (event) => {
  const e = event.error
  if (e === 'Canceled' ||
      (e != null && (e.name === 'Canceled' || e.message === 'Canceled' || String(e) === 'Canceled'))) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}, { capture: true })

createRoot(document.getElementById('root')!).render(<App />)
