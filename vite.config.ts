import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { createReadStream, existsSync, statSync, readdirSync, mkdirSync, copyFileSync } from 'fs'
import { resolve, extname, join, relative } from 'path'

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Origin-Agent-Cluster': '?1',
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
  plugins: [react(), tutorialPlugin()],
  worker: {
    format: 'iife',
  },
  server: {
    port: 3000,
    headers: isolationHeaders,
  },
  preview: {
    port: 3000,
    headers: isolationHeaders,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
})
