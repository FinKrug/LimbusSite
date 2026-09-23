import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The scraper writes its JSON to ../data; the app imports it from there via "@data".
const dataDir = fileURLToPath(new URL('../data', import.meta.url))

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build also works from a sub-folder
  // (GitHub Pages) or inside a desktop overlay later.
  base: './',
  resolve: { alias: { '@data': dataDir } },
  server: { fs: { allow: ['..'] } },
  // The bundled gift data makes one ~1 MB chunk (~170 kB gzipped); that's fine.
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node' },
})
