#!/usr/bin/env node
// Turn raw product captures into marketing-ready variants.
//
//   node scripts/marketing-shots/edit.mjs [idFilter ...]
//
// Reads <OUT>/capture-log.json (written by capture.mjs) joined with shots.mjs,
// and for every captured shot writes, under <OUT>/product/<module>/:
//
//   edited/<id>-full.png              full UI in a restrained app frame, 16:10
//   edited/<id>-marketing.png         sidebar + top bar removed, empty gutters
//                                     trimmed, same frame, 16:10
//   feature-details/<id>-detail.png   focus card only (when capture found one),
//                                     16:10 or 4:3, never enlarged
//   hero/<id>-hero.png                hero: true shots, 3840×2160 brand gradient
//
// plus <OUT>/edit-log.json listing every produced file with its read-back size.
//
// AUTHENTICITY: UI pixels are only ever cropped and (Lanczos) scaled DOWN with
// sharp before compositing, and each crop is placed in the page at exactly its
// own pixel size, so the browser never resamples it. Everything added (frame,
// window bar, shadow, background) sits outside the screenshot. Originals are
// read-only.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { chromium } from '@playwright/test'
import { SHOTS } from './shots.mjs'

const OUT = path.resolve(process.env.ASSETS_DIR || '../qms-marketing/marketing-assets')
const CAPTURE_LOG = process.env.CAPTURE_LOG || path.join(OUT, 'capture-log.json')
const DPR = 2 // capture deviceScaleFactor: CSS px × 2 = image px

// ── Design tokens (image px) ────────────────────────────────────────────────
const BAR = 56 // window bar height (28 CSS px at 2x)
const RADIUS = 24
const BARE_RADIUS = 32 // a dialog panel's own corner (rounded-2xl at 2x): clips the scrim out of its corners
const BRAND = { 50: '#ecf6ff', 100: '#d2ebff', 500: '#1a7dff', 600: '#0e62e0', 900: '#0c2f66' }
const BREATH = 40 * DPR // breathing room kept around trimmed content
const FOCUS_PAD = 24 * DPR

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mshots-'))

// ── Pixel analysis ──────────────────────────────────────────────────────────
// Bounding box of everything that is not the page background inside `region`
// of `file`. Background = the most common colour in the region. A column/row
// counts as content when a few pixels in it differ from the background, which
// ignores antialiasing noise but never a real 1px border or a line of text.
async function contentBounds(file, region) {
  const { data, info } = await sharp(file)
    .extract(region)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const hist = new Map()
  for (let i = 0; i < data.length; i += 3 * 7) {
    const k = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
    hist.set(k, (hist.get(k) || 0) + 1)
  }
  const bgKey = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const bg = [(bgKey >> 16) & 255, (bgKey >> 8) & 255, bgKey & 255]
  const colHits = new Uint32Array(w)
  const rowHits = new Uint32Array(h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3
      if (
        Math.abs(data[i] - bg[0]) > 6 ||
        Math.abs(data[i + 1] - bg[1]) > 6 ||
        Math.abs(data[i + 2] - bg[2]) > 6
      ) {
        colHits[x]++
        rowHits[y]++
      }
    }
  }
  const MIN = 2
  const first = (arr) => arr.findIndex((v) => v >= MIN)
  const last = (arr) => {
    for (let i = arr.length - 1; i >= 0; i--) if (arr[i] >= MIN) return i
    return -1
  }
  const x0 = first(colHits)
  if (x0 < 0) return null
  return { left: x0, right: last(colHits), top: first(rowHits), bottom: last(rowHits), bg }
}

// How far each side of `box` can be padded (up to `max`) before hitting other
// content. Walks outward line by line and stops at the first line containing
// pixels that differ from the page background, leaving part of the gap so no
// sliver of a neighbouring card is ever included.
async function cleanPadding(file, { W, H }, box, max) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width
  const px = (x, y) => {
    const i = (y * w + x) * 3
    return [data[i], data[i + 1], data[i + 2]]
  }
  // background sampled just outside the box corners, most common wins
  const samples = [
    [box.l - 6, box.t - 6], [box.r + 5, box.t - 6], [box.l - 6, box.b + 5], [box.r + 5, box.b + 5],
  ].filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H).map(([x, y]) => px(x, y).join(','))
  const bg = (samples.sort((a, b) => samples.filter((v) => v === b).length - samples.filter((v) => v === a).length)[0] || '255,255,255').split(',').map(Number)
  const dirty = (x, y) => {
    const p = px(x, y)
    return Math.abs(p[0] - bg[0]) > 8 || Math.abs(p[1] - bg[1]) > 8 || Math.abs(p[2] - bg[2]) > 8
  }
  const lineDirty = (vertical, at, from, to) => {
    let n = 0
    for (let k = from; k < to; k++) if ((vertical ? dirty(at, k) : dirty(k, at)) && ++n >= 2) return true
    return false
  }
  const walk = (vertical, start, step, limit, from, to) => {
    // d=1..2 may be the card's own faint shadow: tolerate it, but anything
    // further out is a neighbour — stop halfway into the gap (at most 12px short).
    let shadow = 0
    for (let d = 1; d <= max; d++) {
      const at = start + step * d
      if (at < 0 || at >= limit) return d - 1
      if (lineDirty(vertical, at, Math.max(0, from), Math.min(vertical ? H : W, to))) {
        if (d <= 2 && d === shadow + 1) {
          shadow = d
          continue
        }
        const gap = d - 1 - shadow
        return shadow + Math.max(0, gap - Math.min(12, Math.ceil(gap / 2)))
      }
    }
    return max
  }
  // A dimmed modal backdrop around the box (dialogs): padding would show the
  // grey scrim and blurred page behind it, so crop exactly to the panel.
  if (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2] < 215) return { l: 0, r: 0, t: 0, b: 0, backdrop: true }
  return {
    l: walk(true, box.l, -1, W, box.t, box.b),
    r: walk(true, box.r - 1, 1, W, box.t, box.b),
    t: walk(false, box.t, -1, H, box.l, box.r),
    b: walk(false, box.b - 1, 1, H, box.l, box.r),
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Crop + optional Lanczos downscale to an exact size. Never enlarges.
async function cropTo(file, region, scale, outFile) {
  const w = Math.round(region.width * Math.min(1, scale))
  const h = Math.round(region.height * Math.min(1, scale))
  let img = sharp(file).extract(region)
  if (w !== region.width || h !== region.height) img = img.resize(w, h, { kernel: 'lanczos3' })
  await img.png().toFile(outFile)
  return { w, h }
}

// ── Layout ──────────────────────────────────────────────────────────────────
// Given a source crop (w×h) and a canvas, choose the largest scale ≤ 1 that
// keeps `pad` clear on every side of the framed window.
function fitScale(src, canvas, pad, bar = BAR) {
  return Math.min(1, (canvas.w - 2 * pad) / src.w, (canvas.h - 2 * pad - bar) / src.h)
}

// Smallest canvas of `ratio` that holds the framed crop with `pad` around it.
function canvasFor(src, ratio, pad, bar = BAR) {
  const fw = src.w + 2 * pad
  const fh = src.h + bar + 2 * pad
  const w = Math.max(fw, fh * ratio)
  return { w: Math.ceil(w), h: Math.ceil(w / ratio) }
}

// ── Rendering ───────────────────────────────────────────────────────────────
function html({ img, w, h, canvas, variant, bare }) {
  const hero = variant === 'hero'
  const bg = hero
    ? `radial-gradient(120% 90% at 50% 0%, #f7fbff 0%, ${BRAND[50]} 45%, ${BRAND[100]} 100%)`
    : `linear-gradient(180deg, #f8fafc 0%, #f1f6fc 55%, ${BRAND[50]} 100%)`
  const shadow = hero
    ? '0 2px 6px rgba(12,47,102,.06), 0 24px 48px -12px rgba(12,47,102,.16), 0 80px 140px -30px rgba(12,47,102,.30)'
    : '0 1px 3px rgba(12,47,102,.05), 0 16px 36px -10px rgba(12,47,102,.10), 0 48px 96px -28px rgba(12,47,102,.16)'
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${canvas.w}px;height:${canvas.h}px;overflow:hidden}
  body{background:${bg};display:flex;align-items:center;justify-content:center}
  .win{width:${bare ? w : w + 4}px;border-radius:${bare ? BARE_RADIUS : RADIUS}px;background:#fff;overflow:hidden;
       border:${bare ? 'none' : '2px solid rgba(12,47,102,.09)'};box-shadow:${shadow}}
  .bar{height:${BAR}px;display:flex;align-items:center;gap:14px;padding:0 24px;
       background:#fbfcfe;border-bottom:2px solid rgba(12,47,102,.07)}
  .dot{width:16px;height:16px;border-radius:50%;background:#d6dce5}
  img{display:block;width:${w}px;height:${h}px;image-rendering:auto}
  </style></head><body><div class="win">${bare ? '' : '<div class="bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i></div>'}
  <img src="${pathToFileURL(img).href}"></div></body></html>`
}

async function render(browser, spec, outFile) {
  const page = await browser.newPage({ viewport: { width: spec.canvas.w, height: spec.canvas.h }, deviceScaleFactor: 1 })
  const htmlFile = path.join(TMP, `${path.basename(outFile)}.html`)
  fs.writeFileSync(htmlFile, html(spec))
  await page.goto(pathToFileURL(htmlFile).href)
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  await page.screenshot({ path: outFile, omitBackground: false })
  await page.close()
}

// Crop `region` of the original, fit it into `canvas`, frame and render.
async function compose(browser, { file, region, canvas, pad, variant, outFile, bare = false }) {
  const scale = fitScale({ w: region.width, h: region.height }, canvas, pad, bare ? 0 : BAR)
  const tmp = path.join(TMP, `${path.basename(outFile)}.crop.png`)
  const { w, h } = await cropTo(file, region, scale, tmp)
  await render(browser, { img: tmp, w, h, canvas, variant, bare }, outFile)
  return { scale: +Math.min(1, scale).toFixed(4), crop: region }
}

// ── Variants ────────────────────────────────────────────────────────────────
async function variants(browser, shot, entry, file) {
  const meta = await sharp(file).metadata()
  const W = meta.width
  const H = meta.height
  const dir = path.join(OUT, 'product', shot.module)
  const jobs = []
  const skipped = []

  // 1. full — whole window, 1:1 on 3200×2000.
  jobs.push({
    variant: 'full',
    region: { left: 0, top: 0, width: W, height: H },
    canvas: { w: 3200, h: 2000 },
    pad: 150,
    outFile: path.join(dir, 'edited', `${shot.id}-full.png`),
  })

  // 2. marketing — strip app chrome, trim empty gutters, keep breathing room.
  const sx = clamp(Math.round((entry.chrome?.sidebarRight || 0) * DPR), 0, W - 1)
  const sy = clamp(Math.round((entry.chrome?.headerBottom || 0) * DPR), 0, H - 1)
  const main = { left: sx, top: sy, width: W - sx, height: H - sy }
  const b = await contentBounds(file, main)
  let mk = main
  if (b) {
    const left = clamp(b.left - BREATH, 0, main.width)
    const right = clamp(b.right + 1 + BREATH, 0, main.width)
    const top = clamp(b.top - BREATH, 0, main.height)
    // only trim the bottom when a real empty band exists (content usually runs off-screen)
    const bottom = main.height - (b.bottom + 1) > 2 * BREATH ? b.bottom + 1 + BREATH : main.height
    mk = { left: main.left + left, top: main.top + top, width: right - left, height: bottom - top }
  }
  const mkCanvas = canvasFor({ w: mk.width, h: mk.height }, 16 / 10, 150)
  const capped = mkCanvas.w > 3200 ? { w: 3200, h: 2000 } : mkCanvas
  jobs.push({
    variant: 'marketing',
    region: mk,
    canvas: capped,
    pad: 150,
    outFile: path.join(dir, 'edited', `${shot.id}-marketing.png`),
  })

  // 3. detail — focus card + padding, never enlarged, 16:10 or 4:3.
  // Too small = the capture matched a heading/tab, not a card: a detail of it says nothing.
  const focusUsable = entry.focus && entry.focus.width >= 200 && entry.focus.height >= 80 && entry.focus.y >= 0 && entry.focus.y < H / DPR
  if (focusUsable) {
    const f = entry.focus
    const fl = clamp(Math.floor(f.x * DPR), 0, W - 1)
    const ft = clamp(Math.floor(f.y * DPR), 0, H - 1)
    const fr = clamp(Math.ceil((f.x + f.width) * DPR), fl + 1, W)
    const fb = clamp(Math.ceil((f.y + f.height) * DPR), ft + 1, H)
    // Pad outward, but stop short of a neighbouring card so no sliver of it shows.
    const pads = await cleanPadding(file, { W, H }, { l: fl, t: ft, r: fr, b: fb }, FOCUS_PAD)
    const l = fl - pads.l
    const t = ft - pads.t
    const r = fr + pads.r
    const btm = fb + pads.b
    const region = { left: l, top: t, width: r - l, height: btm - t }
    if (region.width > 40 && region.height > 40) {
      const pad = Math.round(clamp(Math.max(region.width, region.height) * 0.09, 72, 160))
      const src = { w: region.width, h: region.height }
      const bar = pads.backdrop ? 0 : BAR
      const opts = [16 / 10, 4 / 3].map((ratio) => {
        let c = canvasFor(src, ratio, pad, bar)
        if (c.w > 3200) c = { w: 3200, h: Math.round(3200 / ratio) }
        const s = fitScale(src, c, pad, bar)
        const waste = 1 - (src.w * s * (src.h * s + bar)) / (c.w * c.h)
        return { c, waste }
      })
      const best = opts.sort((a, z) => a.waste - z.waste)[0]
      jobs.push({
        variant: 'detail',
        region,
        canvas: best.c,
        pad,
        bare: pads.backdrop,
        outFile: path.join(dir, 'feature-details', `${shot.id}-detail.png`),
      })
    }
  }

  if (!jobs.some((j) => j.variant === 'detail') && (shot.focus || shot.focusSel)) {
    skipped.push({
      variant: 'detail',
      reason: entry.focusMissing
        ? `focus "${entry.focusMissing}" not found at capture`
        : entry.focus && entry.focus.width > 0 && entry.focus.height > 0 && entry.focus.y < H / DPR
          ? `focus box too small to be a card — matched a heading/tab (${Math.round(entry.focus.width)}×${Math.round(entry.focus.height)} CSS px)`
          : entry.focus
          ? `focus box outside the viewport (${JSON.stringify(entry.focus)})`
          : 'no focus box recorded',
    })
  }

  // 4. hero — full window large on a soft brand gradient, 3840×2160.
  if (shot.hero) {
    jobs.push({
      variant: 'hero',
      region: { left: 0, top: 0, width: W, height: H },
      canvas: { w: 3840, h: 2160 },
      pad: 220,
      outFile: path.join(dir, 'hero', `${shot.id}-hero.png`),
    })
  }

  const produced = []
  for (const j of jobs) {
    const info = await compose(browser, { file, ...j })
    const m = await sharp(j.outFile).metadata()
    const bytes = fs.statSync(j.outFile).size
    if (!m.width || !m.height || !bytes) throw new Error(`${j.variant}: empty output ${j.outFile}`)
    produced.push({
      variant: j.variant,
      file: path.relative(OUT, j.outFile),
      width: m.width,
      height: m.height,
      bytes,
      sourceCrop: info.crop,
      scale: info.scale,
    })
  }
  return { produced, skipped }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(CAPTURE_LOG)) throw new Error(`no capture log at ${CAPTURE_LOG} — run capture.mjs first`)
  const log = JSON.parse(fs.readFileSync(CAPTURE_LOG, 'utf8'))
  const only = process.argv.slice(2)
  const shots = SHOTS.filter((s) => !only.length || only.some((o) => s.id.includes(o)))

  const editLogFile = path.join(OUT, 'edit-log.json')
  const editLog = fs.existsSync(editLogFile) ? JSON.parse(fs.readFileSync(editLogFile, 'utf8')) : {}

  const browser = await chromium.launch()
  const counts = {}
  const failed = []
  for (const shot of shots) {
    const entry = log[shot.id]
    if (!entry || entry.status !== 'captured') {
      if (entry) failed.push({ id: shot.id, reason: `capture ${entry.status}: ${entry.reason ?? ''}` })
      continue
    }
    const file = path.resolve(OUT, entry.file)
    try {
      if (!fs.existsSync(file)) throw new Error(`original missing: ${entry.file}`)
      const { produced, skipped } = await variants(browser, shot, entry, file)
      editLog[shot.id] = { editedAt: new Date().toISOString(), original: entry.file, files: produced, ...(skipped.length && { skipped }) }
      for (const k of skipped) console.info(`  · ${shot.id} ${k.variant} skipped: ${k.reason}`)
      for (const p of produced) counts[p.variant] = (counts[p.variant] || 0) + 1
      console.info(`✓ ${shot.id}  ${produced.map((p) => `${p.variant} ${p.width}×${p.height}`).join(', ')}`)
    } catch (e) {
      failed.push({ id: shot.id, reason: e.message.split('\n')[0] })
      console.info(`✗ ${shot.id}  ${e.message.split('\n')[0]}`)
    }
  }
  await browser.close()
  fs.writeFileSync(editLogFile, JSON.stringify(editLog, null, 2))
  fs.rmSync(TMP, { recursive: true, force: true })
  console.info(`\n${JSON.stringify(counts)}  failed/skipped: ${failed.length}`)
  for (const f of failed) console.info(`  - ${f.id}: ${f.reason}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
