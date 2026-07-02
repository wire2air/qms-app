#!/usr/bin/env node
/**
 * Design-system regression ratchet — prevents NEW design-debt from landing while
 * the existing backlog is swept down (Phase 7). For each rule it counts current
 * occurrences in feature code (src/) and fails only if the count rises ABOVE the
 * recorded baseline. As sweeps reduce a count, lower its baseline here so it
 * can't creep back up. When a baseline reaches 0, the rule becomes a hard ban.
 *
 *   text-[Npx]  — raw pixel font sizes; use a typography token / BaseText/Heading.
 *   <label>     — raw labels; use BaseField / BaseLabel (keyboard/id/ARIA wiring).
 *   <h1-6>      — raw headings; use BaseHeading (document-outline semantics).
 *
 * Run: `npm run lint:ds`. Part of `npm run lint`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCAN_DIRS = ['src/components', 'src/pages']

// Baselines = occurrences in src/ as of Phase 7 start. LOWER these as you sweep;
// never raise them. 0 = fully banned.
const RULES = [
  {
    id: 'no-raw-text-px',
    re: /text-\[[0-9]+px\]/g,
    // Swept 359 (10/11/12px → text-micro/caption/label, pixel-identical), then
    // the last 8px/9px outliers → text-micro (2026-07-02 typography audit).
    // Fully banned.
    baseline: 0,
    hint: 'raw text-[Npx] — use a --text-* token (tw:text-micro/caption/label/body/…) or BaseText/BaseHeading',
  },
  {
    id: 'no-font-mono',
    re: /tw:font-mono/g,
    // One typeface on screen (2026-07-02 typography audit): Inter everywhere,
    // including <pre>/<code> (see --default-mono-font-family in base.css).
    // Print modules use their own scoped print stack, not this class.
    baseline: 0,
    hint: 'tw:font-mono is banned — the app renders one typeface (Inter); code/pre already inherit it',
  },
  {
    id: 'no-raw-label',
    re: /<label\b/g,
    baseline: 134,
    hint: 'raw <label> — route the field through BaseField / BaseLabel (id + for + ARIA)',
  },
  {
    id: 'no-raw-heading',
    re: /<h[1-6]\b/g,
    // Tightened after the ds-label sweep retired several raw headings. Still
    // includes the supplier-portal merge's un-swept src/pages/supplier/*
    // headings — tracked debt to sweep to BaseHeading later.
    baseline: 113,
    hint: 'raw <h1-6> — use BaseHeading (semantic level + visual size)',
  },
]

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (name.endsWith('.vue')) out.push(full)
  }
  return out
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
const strict = process.argv.includes('--strict')
let failed = false

for (const rule of RULES) {
  let count = 0
  const offenders = []
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(rule.re)
    if (matches) {
      count += matches.length
      offenders.push({ file: relative(ROOT, file), n: matches.length })
    }
  }
  const limit = strict ? 0 : rule.baseline
  if (count > limit) {
    failed = true
    console.error(`\n✗ ${rule.id}: ${count} occurrences (limit ${limit}) — ${rule.hint}`)
    offenders
      .sort((a, b) => b.n - a.n)
      .slice(0, 10)
      .forEach((o) => console.error(`    ${o.n}×  ${o.file}`))
  } else {
    const slack = rule.baseline - count
    const note = slack > 0 ? ` — baseline can be tightened to ${count} (${slack} swept)` : ''
    console.log(`✓ ${rule.id}: ${count} / ${rule.baseline}${note}`)
  }
}

if (failed) {
  console.error('\nDesign-system ratchet: new design-debt added above baseline. See above.')
  process.exit(1)
}
console.log('\n✓ Design-system ratchet: no regressions.')
