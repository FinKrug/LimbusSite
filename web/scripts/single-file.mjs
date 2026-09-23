// Packs the production build (dist/) into one self-contained HTML file you can
// send to someone: dist/LimbusSite.html. It opens by double-clicking, with no
// server or install. A normal build can't do that, because browsers block
// <script src> modules on file:// pages.
//
// Run with: npm run build:single
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const read = (file) => readFileSync(join(dist, file), 'utf8')

// Scripts are swapped in last, so their text never goes through the other regexes.
const scripts = []
let html = read('index.html')
  .replace(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g, (_, file) => {
    scripts.push(read(file).replace(/<\/script/gi, '<\\/script'))
    return `<!--SCRIPT${scripts.length - 1}-->`
  })
  .replace(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g, (_, file) => `<style>${read(file)}</style>`)
  .replace(/<link rel="icon" type="image\/svg\+xml" href="\.\/([^"]+)" \/>/, (_, file) =>
    `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(read(file))}" />`)
html = html.replace(/<!--SCRIPT(\d+)-->/g, (_, i) => `<script type="module">${scripts[Number(i)]}</script>`)

if (/src="\.\/|href="\.\/assets/.test(html)) {
  console.error('A file is still linked rather than inlined; check dist/index.html.')
  process.exit(1)
}
const out = join(dist, 'LimbusSite.html')
writeFileSync(out, html)
console.log(`Wrote ${out} (${Math.round(Buffer.byteLength(html) / 1024)} KB). Send that one file; it opens in any modern browser.`)
