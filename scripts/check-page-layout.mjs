#!/usr/bin/env node
/**
 * Page-layout guard — enforces the rules in CLAUDE.md "Page layout" so new pages
 * can't reintroduce the inconsistencies the layout system removed:
 *
 *   1. no-bespoke-content-width — a page must not box its content in a
 *      `tw:max-w-* tw:mx-auto` wrapper; <BasePage width="…"> owns the width.
 *   2. no-header-teleport       — pages must not teleport into the app bar
 *      directly; use <PageHeader :icon title> (which teleports for them).
 *   3. page-needs-basepage      — a component that renders <PageHeader> must be
 *      wrapped in <BasePage>.
 *
 * A "page" is any .vue under src/components or src/pages that renders <BasePage>
 * or <PageHeader>. Run: `npm run lint:layout` (exits non-zero on violations).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCAN_DIRS = ['src/components', 'src/pages']

// Documented exceptions (full-canvas editors, child-owned-layout pages, and the
// public/auth pages that are intentionally out of the app-shell layout system).
const ALLOWLIST = [
  'src/components/workflow/WorkflowEditor.vue',
  'src/components/formAssignment/FormAssignmentEditor.vue',
  'src/components/form-builder/',
  'src/components/formTemplate/formTemplatePageId.vue',
  'src/components/formTemplate/formTemplatePageIdDetails.vue',
  'src/components/formTemplate/formTemplateRecords.vue',
  // Hand-rolled tabs retained (non-contiguous panels) — see CLAUDE.md.
  'src/components/audits/AuditInstancesPageId.vue',
  // Public / auth / supplier-portal pages — intentionally their own layout.
  'src/pages/signin', 'src/pages/signup', 'src/pages/login', 'src/pages/index.vue',
  'src/pages/forgot-password', 'src/pages/reset-password', 'src/pages/accept-invitation',
  'src/pages/form/', 'src/pages/supplier', 'src/pages/support', 'src/pages/asset-request',
  'src/pages/inspections-logs/fill',
]

function allowlisted(rel) {
  return ALLOWLIST.some((a) => rel.includes(a))
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, out)
    else if (name.endsWith('.vue')) out.push(full)
  }
  return out
}

// max-w-3xl..7xl, OR a 3-digit custom step (max-w-125/200/350), OR an arbitrary
// value (max-w-[96rem]) — i.e. the page-content-box widths, NOT small caption
// widths (sm/md/lg/xl/2xl). Paired with mx-auto in the same class attribute.
const BIG_MAXW = String.raw`tw:max-w-(?:3xl|4xl|5xl|6xl|7xl|\d{3}|\[[^\]]+\])`
const CENTER_BOX = new RegExp(
  `(?:${BIG_MAXW}[^"']*tw:mx-auto)|(?:tw:mx-auto[^"']*${BIG_MAXW})`,
)
const HEADER_TELEPORT = /to=["']#main-header-(?:title|actions)["']/

const RULES = [
  {
    id: 'no-bespoke-content-width',
    pageOnly: true,
    test: (src) => CENTER_BOX.test(src),
    msg: 'Bespoke centered content box (max-w-* + mx-auto). Remove it — <BasePage width="standard|wide|narrow"> owns the page width.',
  },
  {
    id: 'no-header-teleport',
    pageOnly: false,
    test: (src) => HEADER_TELEPORT.test(src),
    msg: 'Direct teleport into the app bar. Use <PageHeader :icon title><template #actions>…</template></PageHeader> instead.',
  },
  {
    id: 'page-needs-basepage',
    pageOnly: false,
    test: (src) => /<PageHeader\b/.test(src) && !/<BasePage\b/.test(src),
    msg: 'Renders <PageHeader> but is not wrapped in <BasePage>. Every app page root is <BasePage>.',
  },
]

const violations = []
for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file)
    if (allowlisted(rel)) continue
    const src = readFileSync(file, 'utf8')
    const isPage = /<BasePage\b/.test(src) || /<PageHeader\b/.test(src)
    for (const rule of RULES) {
      if (rule.pageOnly && !isPage) continue
      if (rule.test(src)) violations.push({ rel, id: rule.id, msg: rule.msg })
    }
  }
}

if (violations.length) {
  console.error(`\n✖ Page-layout guard: ${violations.length} violation(s)\n`)
  for (const v of violations) {
    console.error(`  ${v.rel}\n    [${v.id}] ${v.msg}\n`)
  }
  console.error('See CLAUDE.md "Page layout". Add a genuine exception to the')
  console.error('ALLOWLIST in scripts/check-page-layout.mjs only if truly warranted.\n')
  process.exit(1)
}

console.log('✓ Page-layout guard: no violations')
