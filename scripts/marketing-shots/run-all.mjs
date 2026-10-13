#!/usr/bin/env node
// Run the whole pipeline in one go, with live progress in the terminal:
//
//   node scripts/marketing-shots/run-all.mjs              # every shot
//   node scripts/marketing-shots/run-all.mjs capa audits  # only matching ids
//
// capture → edit → webp → catalog. Each stage streams its own [n/total] progress
// lines; the run stops at the first stage that fails.
import './env.mjs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ids = process.argv.slice(2)
const STAGES = [
  ['1/4 Capture', 'capture.mjs', ids],
  ['2/4 Edit', 'edit.mjs', ids],
  ['3/4 WebP', 'webp.mjs', ids],
  ['4/4 Catalog', 'catalog.mjs', []], // always rebuilt from everything on disk
]

const t0 = Date.now()
for (const [label, script, args] of STAGES) {
  console.info(`\n══════ ${label} ${'═'.repeat(Math.max(0, 50 - label.length))}`)
  const r = spawnSync(process.execPath, [path.join(here, script), ...args], { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${r.status}) — stopping.`)
    process.exit(r.status ?? 1)
  }
}
const s = Math.round((Date.now() - t0) / 1000)
console.info(`\n✔ All stages done in ${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`)
