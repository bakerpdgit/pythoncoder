import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { createReadStream, existsSync, statSync, readdirSync, mkdirSync, copyFileSync, writeFileSync } from 'fs'
import { resolve, extname, join, relative } from 'path'

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Origin-Agent-Cluster': '?1',
}

const noCacheHtmlHeaders = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}

// Build-time version stamp; written to dist/version.json so the running app
// can poll for new deployments and prompt the user to reload.
function versionPlugin(): Plugin {
  const buildVersion = String(Date.now())
  return {
    name: 'app-version',
    config() {
      return {
        define: {
          __APP_VERSION__: JSON.stringify(buildVersion),
        },
      }
    },
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          ...noCacheHtmlHeaders,
        })
        res.end(JSON.stringify({ version: buildVersion }))
      })
    },
    closeBundle() {
      const outDir = resolve(__dirname, 'dist')
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
      writeFileSync(join(outDir, 'version.json'), JSON.stringify({ version: buildVersion }))
    },
  }
}

const TUTORIAL_SRC = resolve(__dirname, 'tutorial')
const TUTORIAL_DEST = resolve(__dirname, 'dist/tutorial')

function copyDirSync(src: string, dest: string) {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
  for (const item of readdirSync(src)) {
    const s = join(src, item), d = join(dest, item)
    statSync(s).isDirectory() ? copyDirSync(s, d) : copyFileSync(s, d)
  }
}

function tutorialPlugin(): Plugin {
  const MIME: Record<string, string> = {
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
    '.py': 'text/plain; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
  }
  return {
    name: 'serve-tutorial',
    configureServer(server) {
      server.middlewares.use('/tutorial', (req, res, next) => {
        const url = decodeURIComponent((req.url ?? '/').split('?')[0])
        const safePath = resolve(TUTORIAL_SRC, url.replace(/^\/+/, ''))
        if (!safePath.startsWith(TUTORIAL_SRC)) { res.writeHead(403); res.end('Forbidden'); return }
        if (!existsSync(safePath) || statSync(safePath).isDirectory()) { next(); return }
        const mime = MIME[extname(safePath).toLowerCase()] ?? 'application/octet-stream'
        res.writeHead(200, { 'Content-Type': mime, ...isolationHeaders })
        createReadStream(safePath).pipe(res)
      })
    },
    closeBundle() {
      if (existsSync(TUTORIAL_SRC)) copyDirSync(TUTORIAL_SRC, TUTORIAL_DEST)
    },
  }
}

export default defineConfig({
  plugins: [react(), tutorialPlugin(), versionPlugin()],
  worker: {
    format: 'iife',
  },
  server: {
    port: 3000,
    headers: { ...isolationHeaders, ...noCacheHtmlHeaders },
  },
  preview: {
    port: 3000,
    headers: { ...isolationHeaders, ...noCacheHtmlHeaders },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
})
