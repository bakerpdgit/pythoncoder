import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'

// Monaco cancels pending language-service operations whenever the editor model
// changes (e.g. on filesystem switch). Those cancellations surface as unhandled
// promise rejections with name/message === 'Canceled'. They are harmless Monaco
// internals — suppress them so they don't pollute the console.
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.name === 'Canceled' || event.reason?.message === 'Canceled') {
    event.preventDefault()
  }
})

createRoot(document.getElementById('root')!).render(<App />)
