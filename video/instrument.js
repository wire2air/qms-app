#!/usr/bin/env node
/**
 * Point spec files at video/fixtures/videoTest.js instead of '@playwright/test'.
 *
 * WHY THIS STEP EXISTS. Everything else in this pipeline is external: the
 * reporter reads step metadata the runner already produces, and ffmpeg works on
 * files after the fact. But the cursor, click ripples, typed-text readout and
 * keyboard chips (requirements 8–11) have to run INSIDE the page, and the only
 * way to get code there reliably across navigations is `page.addInitScript` —
 * which needs a fixture, which needs the spec to import our `test`.
 *
 * There is no supported hook that injects a fixture into specs from a config
 * file. (A Chromium extension via --load-extension would avoid the rewrite, but
 * it is Chromium-only and so fails requirement 18's Firefox case.)
 *
 * The rewrite is one line per file, idempotent, and reversible with --undo. It
 * is safe to commit: videoTest.js re-exports @playwright/test unchanged and its
 * fixture is inert unless VIDEO_MODE=1, so ordinary runs are byte-identical in
 * behaviour.
 *
 * Usage:
 *   node video/instrument.js            # instrument all specs under e2e/
 *   node video/instrument.js --undo     # revert
 *   node video/instrument.js --check    # exit 1 if anything is un-instrumented
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const E2E = path.join(ROOT, 'e2e')

const argv = process.argv.slice(2)
const UNDO = argv.includes('--undo')
const CHECK = argv.includes('--check')

/** Every .spec.js under e2e/. auth.setup.js is excluded — it has no page HUD to show. */
function specFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) specFiles(full, out)
    else if (entry.name.endsWith('.spec.js')) out.push(full)
  }
  return out
}

/** Relative specifier from a spec back to video/fixtures/videoTest.js. */
function importPath(specFile) {
  const rel = path
    .relative(path.dirname(specFile), path.join(ROOT, 'video/fixtures/videoTest.js'))
    .split(path.sep)
    .join('/')
  return rel.startsWith('.') ? rel : `./${rel}`
}

// Matches: import { test, expect } from '@playwright/test'
const TO_VIDEO = /(\bimport\s*\{[^}]*\}\s*from\s*)['"]@playwright\/test['"]/g
const TO_BASE = /(\bimport\s*\{[^}]*\}\s*from\s*)['"][^'"]*video\/fixtures\/videoTest\.js['"]/g

let changed = 0
let already = 0
const pending = []

for (const file of specFiles(E2E)) {
  const src = fs.readFileSync(file, 'utf8')
  let out = src

  if (UNDO) {
    out = src.replace(TO_BASE, `$1'@playwright/test'`)
  } else {
    const target = importPath(file)
    out = src.replace(TO_VIDEO, `$1'${target}'`)
  }

  if (out === src) {
    // Nothing to do: either already in the desired state, or the file imports
    // Playwright in a form this codemod does not recognise.
    if (!UNDO && !TO_BASE.test(src) && /@playwright\/test/.test(src)) pending.push(file)
    else already++
    TO_BASE.lastIndex = 0
    continue
  }

  if (CHECK) {
    pending.push(file)
    continue
  }

  fs.writeFileSync(file, out, 'utf8')
  changed++
}

const label = UNDO ? 'reverted' : 'instrumented'

if (CHECK) {
  if (pending.length) {
    console.error(`[instrument] ${pending.length} spec(s) not instrumented:`)
    for (const f of pending.slice(0, 10)) console.error(`  · ${path.relative(ROOT, f)}`)
    if (pending.length > 10) console.error(`  … and ${pending.length - 10} more`)
    console.error('Run: npm run video:instrument')
    process.exit(1)
  }
  console.log('[instrument] all specs instrumented')
  process.exit(0)
}

console.log(`[instrument] ${label} ${changed} spec(s); ${already} already in the target state`)
if (pending.length) {
  console.warn(
    `[instrument] ${pending.length} spec(s) import @playwright/test in an unrecognised form ` +
      'and were left alone — they will record video but no in-page cursor:',
  )
  for (const f of pending) console.warn(`  · ${path.relative(ROOT, f)}`)
}
