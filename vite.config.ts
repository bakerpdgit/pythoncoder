import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Origin-Agent-Cluster': '?1',
}

export default defineConfig({
  plugins: [react()],
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
