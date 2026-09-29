#!/usr/bin/env node
// Export web-ready WebP copies of the marketing assets.
//
//   node scripts/marketing-shots/webp.mjs [idFilter ...]
//
// Two kinds, both from genuine captures — resize + encode only:
//   1. Every edited variant (edited/*-full|-marketing.png, feature-details/*-detail.png,
//      hero/*-hero.png) → the same folder as <name>.webp, max 1600 px wide, aspect kept.
//   2. <module>/screens/<id>-screen.webp — the RAW original at 1600×900, no frame. This
//      is the shape the marketing site's own slots use
//      (app/public/media/screenshots/audit-trail/audit-log-feed.webp), so a file can be
//      dropped into public/media/screenshots/<module>/ as-is.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const OUT = path.resolve(process.env.ASSETS_DIR || '../qms-marketing/marketing-assets')
const MAX_W = 1600
const QUALITY = 82
const only = process.argv.slice(2)

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)],
  )
}

const pngs = walk(path.join(OUT, 'product')).filter(
  (f) => f.endsWith('.png') && (!only.length || only.some((o) => path.basename(f).includes(o))),
)

const results = []
for (const src of pngs) {
  const folder = path.basename(path.dirname(src))
  const base = path.basename(src, '.png')
  let dest
  let pipeline = sharp(src)
  if (folder === 'originals') {
    const id = base.replace(/-original$/, '')
    dest = path.join(path.dirname(path.dirname(src)), 'screens', `${id}-screen.webp`)
    // 2880×1624 → 1600×900: the 4px of extra height is trimmed from the bottom,
    // never the top, so the page header is untouched.
    pipeline = pipeline.resize(MAX_W, 900, { fit: 'cover', position: 'top', kernel: 'lanczos3' })
  } else if (['edited', 'feature-details', 'hero'].includes(folder)) {
    dest = path.join(path.dirname(src), `${base}.webp`)
    pipeline = pipeline.resize({ width: MAX_W, withoutEnlargement: true, kernel: 'lanczos3' })
  } else {
    continue
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const info = await pipeline.flatten({ background: '#ffffff' }).webp({ quality: QUALITY, effort: 6 }).toFile(dest)
  results.push({ file: path.relative(OUT, dest), width: info.width, height: info.height, bytes: info.size })
}

const kb = (n) => `${Math.round(n / 1024)} KB`
const total = results.reduce((a, r) => a + r.bytes, 0)
console.info(`${results.length} webp files, ${kb(total)} total, avg ${kb(total / Math.max(results.length, 1))}`)
fs.writeFileSync(path.join(OUT, 'webp-log.json'), JSON.stringify(results, null, 2))
