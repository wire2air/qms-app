#!/usr/bin/env node
/**
 * Form-system guard — enforces the reusable form foundation (docs/superpowers/
 * specs/2026-06-23-form-system-design.md) so new/touched forms can't reintroduce
 * the two anti-patterns the system removed:
 *
 *   1. no-handrolled-form-card — a titled form section must use <FormSection>
 *      (BaseCard + BaseSectionHeader), not a hand-rolled
 *      `<div class="tw:bg-white tw:border … tw:rounded-* tw:p-5">` card. The
 *      literal also hardcodes bg-white (breaks dark mode — FormSection uses
 *      bg-card).
 *   2. no-toast-validation — required-field validation must surface through
 *      <ValidationSummary> + per-field <BaseField :error>, not a pile of
 *      `toast({ message: 'X is required' })` calls (one error at a time,
 *      transient, unanchored, a screen-reader dead end).
 *
 * The full form-module migration is complete: every form is on the form system,
 * so the gate now enforces the rules repo-wide with no allowlist. Run:
 * `npm run lint:forms`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCAN_DIRS = ['src/components', 'src/pages']

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (name.endsWith('.vue')) out.push(full)
  }
  return out
}

// A hand-rolled card surface: bg-white + border + rounded-* + p-5 in one class
// attribute (the chrome FormSection replaces). Order-independent on the three
// signals that distinguish a "card" from an incidental bg-white box.
const HANDROLLED_CARD = [
  /tw:bg-white(?=[^"']*tw:border)(?=[^"']*tw:rounded)(?=[^"']*tw:p-5)/,
  /tw:p-5(?=[^"']*tw:bg-white)(?=[^"']*tw:border)(?=[^"']*tw:rounded)/,
]

// toast(...) / toast.notify(...) / toast.error(...) whose message looks like a
// field-validation error.
const TOAST_VALIDATION = /\btoast(?:\.\w+)?\([^)]*(?:is required|required|please (?:select|enter|fill|complete))/i

const RULES = [
  {
    id: 'no-handrolled-form-card',
    test: (src) => HANDROLLED_CARD.some((re) => re.test(src)),
    msg: 'Hand-rolled form card (bg-white + border + rounded + p-5). Use <FormSection title icon> — it owns the chrome and is dark-mode-safe (bg-card).',
  },
  {
    id: 'no-toast-validation',
    test: (src) => TOAST_VALIDATION.test(src),
    msg: 'Validation surfaced via toast. Use <ValidationSummary> + <BaseField :error> (BaseForm wires both) so errors are persistent, anchored, and accessible.',
  },
]

const violations = []
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file)
    const src = readFileSync(file, 'utf8')
    for (const rule of RULES) {
      if (rule.test(src)) violations.push({ rel, id: rule.id, msg: rule.msg })
    }
  }
}

if (violations.length) {
  console.error(`\n✖ Form-system guard: ${violations.length} violation(s)\n`)
  for (const v of violations) {
    console.error(`  ${v.rel}\n    [${v.id}] ${v.msg}\n`)
  }
  console.error('See docs/superpowers/specs/2026-06-23-form-system-design.md.')
  console.error('Fix the form to use <FormSection> and <BaseField :rules>/')
  console.error('<ValidationSummary> — the migration is complete and the gate')
  console.error('is now enforced repo-wide (no allowlist).\n')
  process.exit(1)
}

console.log('✓ Form-system guard: no violations')
