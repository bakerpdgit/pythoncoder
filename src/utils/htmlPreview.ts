const PREVIEW_SCOPE = '/__vfs_preview__/'
const PREVIEW_SW_URL = '/vfs-preview-sw.js'
const ACTIVATION_TIMEOUT_MS = 5000

let registrationPromise: Promise<void> | null = null

export function isHtmlFile(name: string, mimeType?: string): boolean {
  return (mimeType ?? '').split(';')[0].trim().toLowerCase() === 'text/html'
    || name.toLowerCase().endsWith('.html')
    || name.toLowerCase().endsWith('.htm')
}

export function buildVfsPreviewUrl(fsId: string, path: string, version = Date.now()): string {
  const encodedFsId = encodeURIComponent(fsId)
  const encodedPath = path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  const filePath = encodedPath || 'index.html'
  return `${PREVIEW_SCOPE}fs/${encodedFsId}/${filePath}?v=${version}`
}

export async function ensureVfsPreviewServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('HTML preview requires a browser with service worker support.')
  }

  registrationPromise ??= navigator.serviceWorker
    .register(PREVIEW_SW_URL, { scope: PREVIEW_SCOPE })
    .then(async registration => {
      const worker = registration.active ?? registration.waiting ?? registration.installing
      if (!worker) throw new Error('HTML preview service worker did not start.')
      await waitForActivation(worker)
    })
    .catch(error => {
      registrationPromise = null
      throw error
    })

  return registrationPromise
}

function waitForActivation(worker: ServiceWorker): Promise<void> {
  if (worker.state === 'activated') return Promise.resolve()

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Timed out while starting the HTML preview service worker.'))
    }, ACTIVATION_TIMEOUT_MS)

    const onStateChange = () => {
      if (worker.state === 'activated') {
        cleanup()
        resolve()
      } else if (worker.state === 'redundant') {
        cleanup()
        reject(new Error('HTML preview service worker became redundant before activation.'))
      }
    }

    const cleanup = () => {
      window.clearTimeout(timeout)
      worker.removeEventListener('statechange', onStateChange)
    }

    worker.addEventListener('statechange', onStateChange)
    onStateChange()
  })
}
