# Detail Template Core & Config Contract (SP-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `BaseDetailLayout` into the configurable, future-proof foundation every QMS detail page inherits — adding a declarative config contract, a variant switch, a banner region, anchor navigation, header morph, reserved AI/version seams, and shell convergence.

**Architecture:** Pure helpers (config normalization, variant/nav/banner resolution) are built and unit-tested first, then consumed by the headless `useDetailLayout` composable, then by new L3 primitives (`BaseBanner`, `BaseBannerRegion`, `DetailAnchorNav`), and finally wired into `BaseDetailLayout` via a single `:config` prop that coexists with today's discrete props (config wins). Behavior for later sub-projects (commands, hotkeys, peek, workflow, version) is **not** implemented — only their config shape and empty render seams.

**Tech Stack:** Vue 3.5 (`<script setup>`, auto-imported Vue APIs/composables/components), Tailwind v4 (`tw:` prefix), `@tabler/icons-vue` (explicit imports), Vitest 4 + `@vue/test-utils`, Storybook 8 (CSF3, `@storybook/vue3-vite`, `addon-a11y`).

## Global Constraints

Copied verbatim from the spec and CLAUDE.md — every task implicitly includes these:

- **Tokens are frozen.** No new color/space/type/elevation tokens. Use existing utilities only.
- **No app page is modified in SP-1.** Proven in Storybook only. (Deprecation warnings in Task 11 are non-breaking.)
- **Auto-imports:** components in `resource/js/shared/components/`, composables in `resource/js/shared/composables/`, and Vue APIs (`ref`, `computed`, `watch`, `onMounted`, `useSlots`, `defineModel`, …) are auto-imported. Do **not** add explicit imports for them. Icons are **not** auto-imported — `import { IconX } from '@tabler/icons-vue'`.
- **`tw:` prefix** on every Tailwind class.
- **`function` keyword** for functions, never `const x = () => {}` (except inline callbacks/predicates).
- **`defineModel`** for v-model.
- **No `<form>` elements.** Clickable non-button elements use `BaseClickableRow`; single inline actions use real `<button>`.
- **PascalCase components** in templates.
- **Pure helpers return data + warnings**, never `console.warn` directly (so they're testable); the thin `defineDetailConfig` wrapper emits warnings in dev via `import.meta.env.DEV`.
- **Tone colors** use Tailwind palette utilities (`tw:bg-amber-50`, `tw:text-red-800`, …) — these are dark-mode-remapped by the token layer and are the existing idiom (see `BaseDetailLayout.stories.js`).
- **Test command:** `npx vitest run <path>` for one file; `npm run test` for all. Storybook build: `npm run build-storybook`.
- **Every git commit message ends with the trailer:**
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Branch:** work continues on `feat/ds-detail-page-template`.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `resource/js/shared/composables/defineDetailConfig.js` | `normalizeDetailConfig` (pure) + `defineDetailConfig` (dev-warn wrapper) | 1 |
| `resource/js/shared/composables/defineDetailConfig.spec.js` | Tests for normalization/defaults/validation | 1 |
| `resource/js/shared/composables/detailVariantHelpers.js` | `resolveVariant`, `morphHeaderVariant` (pure) | 2 |
| `resource/js/shared/composables/detailVariantHelpers.spec.js` | Tests | 2 |
| `resource/js/shared/composables/bannerFactories.js` | `readOnlyBanner()` etc. (pure) | 3 |
| `resource/js/shared/composables/bannerFactories.spec.js` | Tests | 3 |
| `resource/js/shared/composables/detailNavHelpers.js` | `resolveNavModel` (pure) | 4 |
| `resource/js/shared/composables/detailNavHelpers.spec.js` | Tests | 4 |
| `resource/js/shared/composables/useDetailLayout.js` | **Extend:** surface `variantDescriptor` + `navModel` | 5 |
| `resource/js/shared/composables/useDetailLayout.spec.js` | **Extend:** tests for new outputs | 5 |
| `resource/js/shared/components/BaseBanner.vue` | One contextual banner | 6 |
| `resource/js/shared/components/BaseBanner.spec.js` | Tests | 6 |
| `resource/js/shared/components/BaseBannerRegion.vue` | Banner stack between header and content | 7 |
| `resource/js/shared/components/BaseBannerRegion.spec.js` | Tests | 7 |
| `resource/js/shared/components/DetailAnchorNav.vue` | Sticky anchor-nav strip + scrollspy | 8 |
| `resource/js/shared/components/DetailAnchorNav.spec.js` | Tests | 8 |
| `resource/js/shared/components/BaseDetailLayout.vue` | **Extend:** `:config` + banner region (T9); variant + morph + seams + anchor sections (T10) | 9,10 |
| `resource/js/shared/components/BaseDetailLayout.spec.js` | **Extend:** tests for config/banners/variant/anchor | 9,10 |
| `resource/js/shared/components/BaseDetailPage.vue` | **Modify:** `@deprecated` + dev warn | 11 |
| `resource/js/shared/components/BaseOverviewPanel.vue` | **Modify:** `@deprecated` + dev warn | 11 |
| `resource/js/shared/components/detailDeprecation.spec.js` | Tests the warnings fire | 11 |
| `resource/js/shared/components/BaseDetailLayout.stories.js` | **Extend:** config/variants/banners/anchor/morph/seams/responsive | 12 |
| `resource/js/shared/components/detailLayout.fixtures.js` | **Extend:** config + banner + section fixtures | 12 |
| `docs/superpowers/specs/2026-06-22-detail-template-core-config-design.md` | **Append:** §7 Interaction Rules (already present) | 13 |
| `CLAUDE.md` | **Append:** detail-page interaction-rules pointer | 13 |

### SP-1 scope decisions (locked here)
- **Anchor nav is a dedicated `DetailAnchorNav` component**, not an overload of `DetailTabs` (the spec sketched extending `DetailTabs`; a separate component avoids `#tab-*` vs `#section-*` slot-name collision and keeps each component single-purpose). Anchor sections render via `#section-{id}` slots; panel tabs keep `#tab-{value}` slots. **Both may coexist** (anchor spine above panel tabs).
- **`readonly` exposes `editable:false` via scoped slot state** — the layout owns no edit controls, so consumer slots react to it.
- **`embedded`**: no breadcrumb teleport, no sticky header, no nav, single column, rail hidden (host drawer provides context). Refined in SP-3.
- **`print`**: linearized single column, rail rendered inline after main, no sticky, not editable.
- **Stub variants** (`approval`, `workflow-review`, `split`) render `standard` plus a visible dev-only TODO marker.

---

### Task 1: Config contract — `defineDetailConfig`

**Files:**
- Create: `resource/js/shared/composables/defineDetailConfig.js`
- Test: `resource/js/shared/composables/defineDetailConfig.spec.js`

**Interfaces:**
- Produces: `normalizeDetailConfig(input?: object) => { config, warnings: string[] }` and `defineDetailConfig(input?: object) => config`. `config` keys: `variant, width, headerVariant, rail, header, breadcrumbs, actions, tabs, sections, railCards, banners, commands, hotkeys, peek, version, ai`. `header`, `breadcrumbs`, `banners` are always functions `(record) => value`. `peek/version/ai` are always `{ enabled: boolean, ... }`. Each `tabs[]` item has `mode: 'panel' | 'anchor'`.

- [ ] **Step 1: Write the failing test**

```js
// resource/js/shared/composables/defineDetailConfig.spec.js
import { describe, it, expect } from 'vitest'
import { normalizeDetailConfig, defineDetailConfig } from './defineDetailConfig.js'

describe('normalizeDetailConfig', () => {
  it('returns valid defaults for an empty input', () => {
    const { config, warnings } = normalizeDetailConfig({})
    expect(warnings).toEqual([])
    expect(config.variant).toBe('standard')
    expect(config.width).toBe('standard')
    expect(config.headerVariant).toBe('full')
    expect(config.rail).toBeUndefined()
    expect(config.actions).toEqual([])
    expect(config.tabs).toEqual([])
    expect(config.sections).toEqual([])
    expect(config.railCards).toEqual([])
    expect(config.commands).toEqual([])
    expect(config.hotkeys).toEqual({})
    expect(config.peek).toEqual({ enabled: false })
    expect(config.version).toEqual({ enabled: false })
    expect(config.ai).toEqual({ enabled: false })
  })

  it('coerces header/breadcrumbs/banners into functions of the record', () => {
    const { config } = normalizeDetailConfig({
      header: { title: 'X' },
      breadcrumbs: [{ label: 'A' }],
      banners: [{ id: 'b', tone: 'info', title: 'Hi' }],
    })
    expect(typeof config.header).toBe('function')
    expect(config.header()).toEqual({ title: 'X' })
    expect(config.breadcrumbs()).toEqual([{ label: 'A' }])
    expect(config.banners()).toEqual([{ id: 'b', tone: 'info', title: 'Hi' }])
  })

  it('passes through header/breadcrumbs/banners that are already functions', () => {
    const { config } = normalizeDetailConfig({ banners: (r) => [{ id: r }] })
    expect(config.banners('x')).toEqual([{ id: 'x' }])
  })

  it('defaults banners to an empty array function', () => {
    const { config } = normalizeDetailConfig({})
    expect(config.banners()).toEqual([])
  })

  it('defaults each tab mode to panel and preserves anchor', () => {
    const { config } = normalizeDetailConfig({
      tabs: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', mode: 'anchor' }],
    })
    expect(config.tabs.map((t) => t.mode)).toEqual(['panel', 'anchor'])
  })

  it('warns and falls back on an unknown variant', () => {
    const { config, warnings } = normalizeDetailConfig({ variant: 'bogus' })
    expect(config.variant).toBe('standard')
    expect(warnings[0]).toContain('Unknown variant "bogus"')
  })

  it('warns on a tab descriptor missing value', () => {
    const { warnings } = normalizeDetailConfig({ tabs: [{ label: 'No value' }] })
    expect(warnings.some((w) => w.includes('missing "value"'))).toBe(true)
  })

  it('merges enabled flags into peek/version/ai', () => {
    const { config } = normalizeDetailConfig({ ai: { enabled: true, model: 'x' } })
    expect(config.ai).toEqual({ enabled: true, model: 'x' })
  })
})

describe('defineDetailConfig', () => {
  it('returns just the config object', () => {
    const config = defineDetailConfig({ variant: 'readonly' })
    expect(config.variant).toBe('readonly')
    expect(config.peek).toEqual({ enabled: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/composables/defineDetailConfig.spec.js`
Expected: FAIL — "Failed to resolve import './defineDetailConfig.js'".

- [ ] **Step 3: Write minimal implementation**

```js
// resource/js/shared/composables/defineDetailConfig.js
/**
 * Detail-page config contract (SP-1 spec §2). Pure normalization + validation.
 * `header`, `breadcrumbs`, `banners` are always normalized to `(record) => value`.
 */
const VALID_VARIANTS = [
  'standard', 'readonly', 'embedded', 'print', 'approval', 'workflow-review', 'split',
]

function asFn(value, fallback) {
  if (value === undefined) return () => fallback
  return typeof value === 'function' ? value : () => value
}

export function normalizeDetailConfig(input = {}) {
  const warnings = []

  const rawVariant = input.variant ?? 'standard'
  const variantOk = VALID_VARIANTS.includes(rawVariant)
  if (!variantOk) warnings.push(`Unknown variant "${rawVariant}"; falling back to "standard".`)

  const tabs = (input.tabs ?? []).map((t) => {
    if (t.value == null) warnings.push('Tab descriptor missing "value".')
    return { ...t, mode: t.mode === 'anchor' ? 'anchor' : 'panel' }
  })

  const config = {
    variant: variantOk ? rawVariant : 'standard',
    width: input.width ?? 'standard',
    headerVariant: input.headerVariant ?? 'full',
    rail: input.rail, // undefined = auto
    header: asFn(input.header, {}),
    breadcrumbs: asFn(input.breadcrumbs, null),
    actions: input.actions ?? [],
    tabs,
    sections: input.sections ?? [],
    railCards: input.railCards ?? [],
    banners: asFn(input.banners, []),
    commands: input.commands ?? [],
    hotkeys: input.hotkeys ?? {},
    peek: { enabled: false, ...(input.peek ?? {}) },
    version: { enabled: false, ...(input.version ?? {}) },
    ai: { enabled: false, ...(input.ai ?? {}) },
  }
  return { config, warnings }
}

export function defineDetailConfig(input = {}) {
  const { config, warnings } = normalizeDetailConfig(input)
  if (import.meta.env?.DEV) {
    warnings.forEach((w) => console.warn(`[defineDetailConfig] ${w}`))
  }
  return config
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/composables/defineDetailConfig.spec.js`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/composables/defineDetailConfig.js resource/js/shared/composables/defineDetailConfig.spec.js
git commit -m "feat(ds): defineDetailConfig contract with normalization + validation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Variant + header-morph helpers

**Files:**
- Create: `resource/js/shared/composables/detailVariantHelpers.js`
- Test: `resource/js/shared/composables/detailVariantHelpers.spec.js`

**Interfaces:**
- Produces: `resolveVariant(variant?: string) => { variant, showBreadcrumbs, stickyHeader, showNav, showRail, columns, editable, linearized, stub }` and `morphHeaderVariant(headerVariant: string, scrolled: boolean) => 'full' | 'compact'`.

- [ ] **Step 1: Write the failing test**

```js
// resource/js/shared/composables/detailVariantHelpers.spec.js
import { describe, it, expect } from 'vitest'
import { resolveVariant, morphHeaderVariant } from './detailVariantHelpers.js'

describe('resolveVariant', () => {
  it('standard is the full two-column editable shell', () => {
    expect(resolveVariant('standard')).toEqual({
      variant: 'standard', showBreadcrumbs: true, stickyHeader: true, showNav: true,
      showRail: true, columns: 2, editable: true, linearized: false, stub: false,
    })
  })
  it('readonly differs from standard only by editable=false', () => {
    expect(resolveVariant('readonly').editable).toBe(false)
    expect(resolveVariant('readonly').columns).toBe(2)
  })
  it('embedded drops chrome and rail, single column', () => {
    const v = resolveVariant('embedded')
    expect(v.showBreadcrumbs).toBe(false)
    expect(v.stickyHeader).toBe(false)
    expect(v.showNav).toBe(false)
    expect(v.showRail).toBe(false)
    expect(v.columns).toBe(1)
  })
  it('print is linearized, single column, not editable', () => {
    const v = resolveVariant('print')
    expect(v.linearized).toBe(true)
    expect(v.columns).toBe(1)
    expect(v.editable).toBe(false)
    expect(v.showRail).toBe(true)
  })
  it('stub variants render standard plus stub=true', () => {
    for (const name of ['approval', 'workflow-review', 'split']) {
      const v = resolveVariant(name)
      expect(v.stub).toBe(true)
      expect(v.variant).toBe(name)
      expect(v.columns).toBe(2)
    }
  })
  it('unknown variant falls back to standard', () => {
    expect(resolveVariant('bogus').variant).toBe('standard')
    expect(resolveVariant().variant).toBe('standard')
  })
})

describe('morphHeaderVariant', () => {
  it('collapses full to compact once scrolled', () => {
    expect(morphHeaderVariant('full', true)).toBe('compact')
  })
  it('stays full when not scrolled', () => {
    expect(morphHeaderVariant('full', false)).toBe('full')
  })
  it('leaves an explicitly compact header compact', () => {
    expect(morphHeaderVariant('compact', false)).toBe('compact')
    expect(morphHeaderVariant('compact', true)).toBe('compact')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/composables/detailVariantHelpers.spec.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// resource/js/shared/composables/detailVariantHelpers.js
/** Structural variant descriptors (SP-1 spec §4). Pure. */
const VARIANTS = {
  standard: { showBreadcrumbs: true, stickyHeader: true, showNav: true, showRail: true, columns: 2, editable: true, linearized: false, stub: false },
  readonly: { showBreadcrumbs: true, stickyHeader: true, showNav: true, showRail: true, columns: 2, editable: false, linearized: false, stub: false },
  embedded: { showBreadcrumbs: false, stickyHeader: false, showNav: false, showRail: false, columns: 1, editable: true, linearized: false, stub: false },
  print: { showBreadcrumbs: false, stickyHeader: false, showNav: false, showRail: true, columns: 1, editable: false, linearized: true, stub: false },
}
const STUBS = new Set(['approval', 'workflow-review', 'split'])

export function resolveVariant(variant = 'standard') {
  if (VARIANTS[variant]) return { variant, ...VARIANTS[variant] }
  if (STUBS.has(variant)) return { variant, ...VARIANTS.standard, stub: true }
  return { variant: 'standard', ...VARIANTS.standard }
}

export function morphHeaderVariant(headerVariant, scrolled) {
  return headerVariant === 'full' && scrolled ? 'compact' : headerVariant
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/composables/detailVariantHelpers.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/composables/detailVariantHelpers.js resource/js/shared/composables/detailVariantHelpers.spec.js
git commit -m "feat(ds): resolveVariant + morphHeaderVariant helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Banner factories

**Files:**
- Create: `resource/js/shared/composables/bannerFactories.js`
- Test: `resource/js/shared/composables/bannerFactories.spec.js`

**Interfaces:**
- Produces: `readOnlyBanner(o?)`, `archivedBanner(o?)`, `approvalPendingBanner(o?)`, `lockedBanner(o?)`, `workflowWaitingBanner(o?)`, `unsavedChangesBanner(o?)`, `validationIssuesBanner(count, o?)`. Each returns a `BannerDescriptor`: `{ id, tone, icon, title, message?, dismissible }`.

- [ ] **Step 1: Write the failing test**

```js
// resource/js/shared/composables/bannerFactories.spec.js
import { describe, it, expect } from 'vitest'
import {
  readOnlyBanner, archivedBanner, approvalPendingBanner, lockedBanner,
  workflowWaitingBanner, unsavedChangesBanner, validationIssuesBanner,
} from './bannerFactories.js'

describe('bannerFactories', () => {
  it('readOnlyBanner is neutral and not dismissible', () => {
    const b = readOnlyBanner()
    expect(b.id).toBe('read-only')
    expect(b.tone).toBe('neutral')
    expect(b.dismissible).toBe(false)
    expect(b.title).toBeTruthy()
    expect(b.icon).toBeTruthy()
  })
  it('archivedBanner is warning tone', () => {
    expect(archivedBanner().tone).toBe('warning')
  })
  it('approvalPendingBanner is info tone', () => {
    expect(approvalPendingBanner().tone).toBe('info')
  })
  it('lockedBanner is warning tone', () => {
    expect(lockedBanner().id).toBe('locked')
    expect(lockedBanner().tone).toBe('warning')
  })
  it('workflowWaitingBanner is info tone', () => {
    expect(workflowWaitingBanner().tone).toBe('info')
  })
  it('unsavedChangesBanner is warning and dismissible-false', () => {
    const b = unsavedChangesBanner()
    expect(b.id).toBe('unsaved-changes')
    expect(b.tone).toBe('warning')
  })
  it('validationIssuesBanner is danger and includes the count', () => {
    const b = validationIssuesBanner(3)
    expect(b.tone).toBe('danger')
    expect(b.message).toContain('3')
  })
  it('allows overriding title and message', () => {
    const b = readOnlyBanner({ title: 'Custom', message: 'Why' })
    expect(b.title).toBe('Custom')
    expect(b.message).toBe('Why')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/composables/bannerFactories.spec.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// resource/js/shared/composables/bannerFactories.js
import {
  IconLock, IconArchive, IconHourglass, IconClock, IconAlertTriangle, IconPencil,
} from '@tabler/icons-vue'

/** Common QMS record-state banners (SP-1 spec §3). Pure descriptor factories. */
export function readOnlyBanner(o = {}) {
  return { id: 'read-only', tone: 'neutral', icon: IconLock,
    title: o.title || 'Read-only', message: o.message ?? 'You don’t have permission to edit this record.', dismissible: false }
}
export function archivedBanner(o = {}) {
  return { id: 'archived', tone: 'warning', icon: IconArchive,
    title: o.title || 'Archived', message: o.message ?? 'This record is archived and read-only.', dismissible: false }
}
export function approvalPendingBanner(o = {}) {
  return { id: 'approval-pending', tone: 'info', icon: IconHourglass,
    title: o.title || 'Approval pending', message: o.message ?? 'This record is awaiting approval.', dismissible: false }
}
export function lockedBanner(o = {}) {
  return { id: 'locked', tone: 'warning', icon: IconLock,
    title: o.title || 'Locked', message: o.message ?? 'This record is locked while a workflow runs.', dismissible: false }
}
export function workflowWaitingBanner(o = {}) {
  return { id: 'workflow-waiting', tone: 'info', icon: IconClock,
    title: o.title || 'Workflow waiting', message: o.message ?? 'A workflow step is waiting on an assignee.', dismissible: false }
}
export function unsavedChangesBanner(o = {}) {
  return { id: 'unsaved-changes', tone: 'warning', icon: IconPencil,
    title: o.title || 'Unsaved changes', message: o.message ?? 'You have unsaved changes.', dismissible: false }
}
export function validationIssuesBanner(count, o = {}) {
  return { id: 'validation-issues', tone: 'danger', icon: IconAlertTriangle,
    title: o.title || 'Validation issues', message: o.message ?? `${count} field${count === 1 ? '' : 's'} need attention.`, dismissible: false }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/composables/bannerFactories.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/composables/bannerFactories.js resource/js/shared/composables/bannerFactories.spec.js
git commit -m "feat(ds): QMS banner descriptor factories

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Nav model helper

**Files:**
- Create: `resource/js/shared/composables/detailNavHelpers.js`
- Test: `resource/js/shared/composables/detailNavHelpers.spec.js`

**Interfaces:**
- Produces: `resolveNavModel(sections?: array, tabs?: array) => { items: Array<{ key, label, icon, mode, count }>, hasAnchor: boolean, hasPanel: boolean }`. Sections always become `mode:'anchor'` (keyed by `id`); tabs keep their `mode` (keyed by `value`), with `count` resolved if it is a function. Items with `visible === false` are dropped.

- [ ] **Step 1: Write the failing test**

```js
// resource/js/shared/composables/detailNavHelpers.spec.js
import { describe, it, expect } from 'vitest'
import { resolveNavModel } from './detailNavHelpers.js'

describe('resolveNavModel', () => {
  it('returns empty for no input', () => {
    expect(resolveNavModel()).toEqual({ items: [], hasAnchor: false, hasPanel: false })
  })
  it('maps sections to anchor items keyed by id', () => {
    const r = resolveNavModel([{ id: 'details', label: 'Details' }], [])
    expect(r.items).toEqual([{ key: 'details', label: 'Details', icon: undefined, mode: 'anchor', count: undefined }])
    expect(r.hasAnchor).toBe(true)
    expect(r.hasPanel).toBe(false)
  })
  it('maps tabs to panel items keyed by value and resolves count functions', () => {
    const r = resolveNavModel([], [{ value: 'docs', label: 'Documents', count: () => 12 }])
    expect(r.items[0]).toEqual({ key: 'docs', label: 'Documents', icon: undefined, mode: 'panel', count: 12 })
    expect(r.hasPanel).toBe(true)
  })
  it('honors an anchor-mode tab', () => {
    const r = resolveNavModel([], [{ value: 'x', label: 'X', mode: 'anchor' }])
    expect(r.items[0].mode).toBe('anchor')
    expect(r.hasAnchor).toBe(true)
  })
  it('drops items with visible === false', () => {
    const r = resolveNavModel([{ id: 'a', label: 'A', visible: false }], [{ value: 'b', label: 'B', visible: false }])
    expect(r.items).toEqual([])
  })
  it('combines sections (anchor) above tabs (panel)', () => {
    const r = resolveNavModel([{ id: 's', label: 'S' }], [{ value: 't', label: 'T' }])
    expect(r.items.map((i) => i.key)).toEqual(['s', 't'])
    expect(r.hasAnchor && r.hasPanel).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/composables/detailNavHelpers.spec.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// resource/js/shared/composables/detailNavHelpers.js
/** Combine anchor sections + panel tabs into one nav model (SP-1 spec §5). Pure. */
export function resolveNavModel(sections = [], tabs = []) {
  const items = [
    ...sections
      .filter((s) => s.visible !== false)
      .map((s) => ({ key: s.id, label: s.label, icon: s.icon, mode: 'anchor', count: undefined })),
    ...tabs
      .filter((t) => t.visible !== false)
      .map((t) => ({
        key: t.value,
        label: t.label,
        icon: t.icon,
        mode: t.mode === 'anchor' ? 'anchor' : 'panel',
        count: typeof t.count === 'function' ? t.count() : t.count,
      })),
  ]
  return {
    items,
    hasAnchor: items.some((i) => i.mode === 'anchor'),
    hasPanel: items.some((i) => i.mode === 'panel'),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/composables/detailNavHelpers.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/composables/detailNavHelpers.js resource/js/shared/composables/detailNavHelpers.spec.js
git commit -m "feat(ds): resolveNavModel helper (anchor sections + panel tabs)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Extend `useDetailLayout` with variant descriptor + nav model

**Files:**
- Modify: `resource/js/shared/composables/useDetailLayout.js`
- Test: `resource/js/shared/composables/useDetailLayout.spec.js`

**Interfaces:**
- Consumes: `resolveVariant` (Task 2), `resolveNavModel` (Task 4).
- Produces: `useDetailLayout(o)` additionally accepts `o.variant` (ref|getter|value), `o.sections` (ref|getter|array), `o.tabs` (ref|getter|array) and additionally returns `variantDescriptor` (computed) and `navModel` (computed). All existing returns (`state, actionBuckets, scrolled, isMobile, isTablet`) are unchanged.

- [ ] **Step 1: Write the failing test (append to existing spec)**

Add these `describe` blocks to `resource/js/shared/composables/useDetailLayout.spec.js`:

```js
import { resolveVariant } from './detailVariantHelpers.js'

describe('useDetailLayout — variant descriptor', () => {
  it('exposes the resolved variant descriptor', () => {
    const { variantDescriptor } = useDetailLayout({ variant: 'readonly' })
    expect(variantDescriptor.value).toEqual(resolveVariant('readonly'))
  })
  it('defaults to standard when no variant given', () => {
    const { variantDescriptor } = useDetailLayout({})
    expect(variantDescriptor.value.variant).toBe('standard')
  })
})

describe('useDetailLayout — nav model', () => {
  it('builds a nav model from sections + tabs', () => {
    const { navModel } = useDetailLayout({
      sections: [{ id: 'details', label: 'Details' }],
      tabs: [{ value: 'activity', label: 'Activity' }],
    })
    expect(navModel.value.items.map((i) => i.key)).toEqual(['details', 'activity'])
    expect(navModel.value.hasAnchor).toBe(true)
    expect(navModel.value.hasPanel).toBe(true)
  })
})
```

> Note: `useDetailLayout` is auto-imported in app code, but the spec file imports it explicitly — check the top of `useDetailLayout.spec.js` and keep its existing import style. If it has no import yet, add `import { useDetailLayout } from './useDetailLayout.js'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/composables/useDetailLayout.spec.js`
Expected: FAIL — `variantDescriptor`/`navModel` are `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `resource/js/shared/composables/useDetailLayout.js`, update the import line and add two computeds before the `return`:

```js
import { resolveDetailState, bucketActions } from './detailLayoutHelpers.js'
import { resolveVariant } from './detailVariantHelpers.js'
import { resolveNavModel } from './detailNavHelpers.js'
```

```js
  const variantDescriptor = computed(() => resolveVariant(toValue(o.variant) || 'standard'))
  const navModel = computed(() =>
    resolveNavModel(toValue(o.sections) || [], toValue(o.tabs) || []),
  )

  return { state, actionBuckets, scrolled, isMobile, isTablet, variantDescriptor, navModel }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/composables/useDetailLayout.spec.js`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/composables/useDetailLayout.js resource/js/shared/composables/useDetailLayout.spec.js
git commit -m "feat(ds): useDetailLayout surfaces variantDescriptor + navModel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `BaseBanner` component

**Files:**
- Create: `resource/js/shared/components/BaseBanner.vue`
- Test: `resource/js/shared/components/BaseBanner.spec.js`

**Interfaces:**
- Produces: `<BaseBanner tone icon title message dismissible @dismiss>`. Props: `tone ∈ 'info'|'warning'|'danger'|'neutral'` (default `'info'`), `icon` (Object|Function|null), `title` (String, required), `message` (String, default `''`), `dismissible` (Boolean, default `false`). Slot `#actions`. Emits `dismiss`. Root `role="status"`, `aria-live="polite"` (`'assertive'` for `danger`), `data-test="base-banner"`, `data-tone="{tone}"`.

- [ ] **Step 1: Write the failing test**

```js
// resource/js/shared/components/BaseBanner.spec.js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseBanner from './BaseBanner.vue'

describe('BaseBanner', () => {
  it('renders title and message with the tone exposed', () => {
    const w = mount(BaseBanner, { props: { tone: 'warning', title: 'Archived', message: 'Read-only.' } })
    expect(w.get('[data-test="base-banner"]').attributes('data-tone')).toBe('warning')
    expect(w.text()).toContain('Archived')
    expect(w.text()).toContain('Read-only.')
  })
  it('uses polite live region by default and assertive for danger', () => {
    const polite = mount(BaseBanner, { props: { title: 'X' } })
    expect(polite.get('[data-test="base-banner"]').attributes('aria-live')).toBe('polite')
    const danger = mount(BaseBanner, { props: { tone: 'danger', title: 'X' } })
    expect(danger.get('[data-test="base-banner"]').attributes('aria-live')).toBe('assertive')
  })
  it('shows no dismiss button unless dismissible', () => {
    const w = mount(BaseBanner, { props: { title: 'X' } })
    expect(w.find('[data-test="banner-dismiss"]').exists()).toBe(false)
  })
  it('emits dismiss when the dismiss button is clicked', async () => {
    const w = mount(BaseBanner, { props: { title: 'X', dismissible: true } })
    await w.get('[data-test="banner-dismiss"]').trigger('click')
    expect(w.emitted('dismiss')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/BaseBanner.spec.js`
Expected: FAIL — cannot resolve `./BaseBanner.vue`.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- resource/js/shared/components/BaseBanner.vue -->
<script setup>
import { IconX } from '@tabler/icons-vue'

const props = defineProps({
  tone: { type: String, default: 'info', validator: (v) => ['info', 'warning', 'danger', 'neutral'].includes(v) },
  icon: { type: [Object, Function], default: null },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  dismissible: { type: Boolean, default: false },
})
defineEmits(['dismiss'])

const TONE = {
  info: 'tw:bg-blue-50 tw:text-blue-800 tw:border-blue-200',
  warning: 'tw:bg-amber-50 tw:text-amber-800 tw:border-amber-200',
  danger: 'tw:bg-red-50 tw:text-red-800 tw:border-red-200',
  neutral: 'tw:bg-gray-50 tw:text-gray-700 tw:border-gray-200',
}
const toneClass = computed(() => TONE[props.tone] || TONE.info)
const ariaLive = computed(() => (props.tone === 'danger' ? 'assertive' : 'polite'))
</script>

<template>
  <div
    data-test="base-banner"
    role="status"
    :data-tone="tone"
    :aria-live="ariaLive"
    class="tw:flex tw:items-start tw:gap-3 tw:rounded-lg tw:border tw:px-4 tw:py-3"
    :class="toneClass"
  >
    <component :is="icon" v-if="icon" :size="18" class="tw:mt-0.5 tw:shrink-0" aria-hidden="true" />
    <div class="tw:min-w-0 tw:flex-1">
      <p class="tw:text-body tw:font-semibold">{{ title }}</p>
      <p v-if="message" class="tw:text-body tw:opacity-90">{{ message }}</p>
      <div v-if="$slots.actions" class="tw:mt-2 tw:flex tw:gap-2">
        <slot name="actions" />
      </div>
    </div>
    <button
      v-if="dismissible"
      type="button"
      data-test="banner-dismiss"
      aria-label="Dismiss"
      class="tw:shrink-0 tw:rounded tw:p-0.5 tw:opacity-70 tw:hover:opacity-100"
      @click="$emit('dismiss')"
    >
      <IconX :size="16" aria-hidden="true" />
    </button>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/BaseBanner.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/components/BaseBanner.vue resource/js/shared/components/BaseBanner.spec.js
git commit -m "feat(ds): BaseBanner contextual banner primitive

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `BaseBannerRegion` component

**Files:**
- Create: `resource/js/shared/components/BaseBannerRegion.vue`
- Test: `resource/js/shared/components/BaseBannerRegion.spec.js`

**Interfaces:**
- Consumes: `BaseBanner` (Task 6, auto-imported).
- Produces: `<BaseBannerRegion :banners="BannerDescriptor[]">`. Renders nothing when `banners` is empty. Tracks locally-dismissed ids (by `banner.id`) so a dismissible banner disappears on click. Root `data-test="banner-region"` only present when at least one banner renders.

- [ ] **Step 1: Write the failing test**

```js
// resource/js/shared/components/BaseBannerRegion.spec.js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseBannerRegion from './BaseBannerRegion.vue'

const banner = (id, extra = {}) => ({ id, tone: 'info', title: id, ...extra })

describe('BaseBannerRegion', () => {
  it('renders nothing when there are no banners', () => {
    const w = mount(BaseBannerRegion, { props: { banners: [] } })
    expect(w.find('[data-test="banner-region"]').exists()).toBe(false)
  })
  it('renders one BaseBanner per descriptor', () => {
    const w = mount(BaseBannerRegion, { props: { banners: [banner('a'), banner('b')] } })
    expect(w.findAll('[data-test="base-banner"]')).toHaveLength(2)
  })
  it('hides a dismissible banner after its dismiss event', async () => {
    const w = mount(BaseBannerRegion, { props: { banners: [banner('a', { dismissible: true })] } })
    await w.get('[data-test="banner-dismiss"]').trigger('click')
    expect(w.findAll('[data-test="base-banner"]')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/BaseBannerRegion.spec.js`
Expected: FAIL — cannot resolve component.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- resource/js/shared/components/BaseBannerRegion.vue -->
<script setup>
const props = defineProps({
  banners: { type: Array, default: () => [] },
})
const dismissed = ref(new Set())
const shown = computed(() => props.banners.filter((b) => !dismissed.value.has(b.id)))

function dismiss(id) {
  const next = new Set(dismissed.value)
  next.add(id)
  dismissed.value = next
}
</script>

<template>
  <div v-if="shown.length" data-test="banner-region" class="tw:flex tw:flex-col tw:gap-2 tw:py-2">
    <BaseBanner
      v-for="b in shown"
      :key="b.id"
      :tone="b.tone"
      :icon="b.icon || null"
      :title="b.title"
      :message="b.message || ''"
      :dismissible="b.dismissible === true"
      @dismiss="dismiss(b.id)"
    >
      <template v-if="b.actions && b.actions.length" #actions>
        <button
          v-for="a in b.actions"
          :key="a.id"
          type="button"
          class="tw:text-body tw:font-semibold tw:underline"
          @click="a.onSelect && a.onSelect()"
        >
          {{ a.label }}
        </button>
      </template>
    </BaseBanner>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/BaseBannerRegion.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/components/BaseBannerRegion.vue resource/js/shared/components/BaseBannerRegion.spec.js
git commit -m "feat(ds): BaseBannerRegion stacks + dismisses banners

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `DetailAnchorNav` component

**Files:**
- Create: `resource/js/shared/components/DetailAnchorNav.vue`
- Test: `resource/js/shared/components/DetailAnchorNav.spec.js`

**Interfaces:**
- Produces: `<DetailAnchorNav :sections="[{ id, label, icon? }]" :activeId="String">`. Renders a `<nav aria-label="Sections">` of `<a :href="'#section-' + id">` links. The link for `activeId` gets `aria-current="true"`. Clicking a link does not navigate away (anchor scroll only). Scrollspy itself (IntersectionObserver) is owned by `BaseDetailLayout` in Task 10 and passed down via `activeId`; this component is presentational so it stays unit-testable in jsdom.

- [ ] **Step 1: Write the failing test**

```js
// resource/js/shared/components/DetailAnchorNav.spec.js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailAnchorNav from './DetailAnchorNav.vue'

const sections = [{ id: 'details', label: 'Details' }, { id: 'workflow', label: 'Workflow' }]

describe('DetailAnchorNav', () => {
  it('renders an anchor link per section with the right href', () => {
    const w = mount(DetailAnchorNav, { props: { sections } })
    const links = w.findAll('a')
    expect(links).toHaveLength(2)
    expect(links[0].attributes('href')).toBe('#section-details')
    expect(links[1].attributes('href')).toBe('#section-workflow')
    expect(w.text()).toContain('Details')
    expect(w.text()).toContain('Workflow')
  })
  it('marks the active section with aria-current', () => {
    const w = mount(DetailAnchorNav, { props: { sections, activeId: 'workflow' } })
    const active = w.findAll('a').find((a) => a.attributes('href') === '#section-workflow')
    expect(active.attributes('aria-current')).toBe('true')
  })
  it('exposes a Sections nav landmark', () => {
    const w = mount(DetailAnchorNav, { props: { sections } })
    expect(w.find('nav[aria-label="Sections"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/DetailAnchorNav.spec.js`
Expected: FAIL — cannot resolve component.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- resource/js/shared/components/DetailAnchorNav.vue -->
<script setup>
defineProps({
  sections: { type: Array, default: () => [] },
  activeId: { type: String, default: '' },
})
</script>

<template>
  <nav
    aria-label="Sections"
    class="tw:flex tw:gap-1 tw:overflow-x-auto tw:border-b tw:border-divider tw:py-2"
  >
    <a
      v-for="s in sections"
      :key="s.id"
      :href="`#section-${s.id}`"
      :aria-current="activeId === s.id ? 'true' : undefined"
      class="tw:flex tw:items-center tw:gap-1.5 tw:whitespace-nowrap tw:rounded-md tw:px-3 tw:py-1.5 tw:text-body tw:font-medium tw:transition-colors tw:motion-reduce:transition-none"
      :class="
        activeId === s.id
          ? 'tw:bg-primary/10 tw:text-primary'
          : 'tw:text-secondary tw:hover:text-on-main'
      "
    >
      <component :is="s.icon" v-if="s.icon" :size="16" aria-hidden="true" />
      {{ s.label }}
    </a>
  </nav>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/DetailAnchorNav.spec.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/components/DetailAnchorNav.vue resource/js/shared/components/DetailAnchorNav.spec.js
git commit -m "feat(ds): DetailAnchorNav sticky anchor-link strip

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `BaseDetailLayout` — accept `:config` + render banner region

**Files:**
- Modify: `resource/js/shared/components/BaseDetailLayout.vue`
- Test: `resource/js/shared/components/BaseDetailLayout.spec.js`

**Interfaces:**
- Consumes: `normalizeDetailConfig` (Task 1), `BaseBannerRegion` (Task 7).
- Produces: `BaseDetailLayout` gains a `config` prop (Object, default `null`). When present, its normalized fields **override** the matching discrete props (config wins) and `config.banners(record)` renders a `BaseBannerRegion` between the header and the body. A new optional `record` prop (Object, default `null`) is passed to the config's `header`/`breadcrumbs`/`banners` functions. The discrete-prop API is unchanged when `config` is absent.

- [ ] **Step 1: Write the failing test (append to existing spec)**

Append to `resource/js/shared/components/BaseDetailLayout.spec.js`:

```js
import { defineDetailConfig } from '../composables/defineDetailConfig.js'
import { readOnlyBanner } from '../composables/bannerFactories.js'

describe('BaseDetailLayout — config + banners', () => {
  it('derives title from config when no discrete title prop', () => {
    const config = defineDetailConfig({ header: () => ({ title: 'From Config' }) })
    const w = mountLayout({ props: { config }, slots: { default: '<div/>' } })
    expect(w.text()).toContain('From Config')
  })
  it('renders the banner region from config.banners(record)', () => {
    const config = defineDetailConfig({ banners: () => [readOnlyBanner()] })
    const w = mountLayout({ props: { config }, slots: { default: '<div/>' } })
    expect(w.find('[data-test="banner-region"]').exists()).toBe(true)
    expect(w.text()).toContain('Read-only')
  })
  it('renders no banner region when config.banners returns empty', () => {
    const config = defineDetailConfig({})
    const w = mountLayout({ props: { config }, slots: { default: '<div/>' } })
    expect(w.find('[data-test="banner-region"]').exists()).toBe(false)
  })
  it('config title wins over the discrete title prop', () => {
    const config = defineDetailConfig({ header: () => ({ title: 'Config Title' }) })
    const w = mountLayout({ props: { config, title: 'Prop Title' }, slots: { default: '<div/>' } })
    expect(w.text()).toContain('Config Title')
    expect(w.text()).not.toContain('Prop Title')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/BaseDetailLayout.spec.js`
Expected: FAIL — config title not rendered, no banner region.

- [ ] **Step 3: Write minimal implementation**

In `resource/js/shared/components/BaseDetailLayout.vue`:

(a) Add the import beneath the existing `IconFileOff` import:

```js
import { normalizeDetailConfig } from '../composables/defineDetailConfig.js'
```

(b) Add two props to `defineProps` (after `error...` block, before the closing `})`):

```js
  config: { type: Object, default: null },
  record: { type: Object, default: null },
```

(c) After `const activeTab = defineModel(...)` add a resolved-config layer:

```js
const cfg = computed(() => (props.config ? normalizeDetailConfig(props.config).config : null))
const headerData = computed(() => (cfg.value ? cfg.value.header(props.record) || {} : {}))

// config wins over discrete props
const effTitle = computed(() => headerData.value.title ?? props.title)
const effIcon = computed(() => headerData.value.icon ?? props.icon)
const effAvatarName = computed(() => headerData.value.avatarName ?? props.avatarName)
const effBreadcrumbs = computed(() =>
  cfg.value ? cfg.value.breadcrumbs(props.record) ?? props.breadcrumbs : props.breadcrumbs,
)
const effActions = computed(() => cfg.value?.actions?.length ? cfg.value.actions : props.actions)
const effTabs = computed(() => (cfg.value?.tabs?.length ? cfg.value.tabs : props.tabs))
const effRailCards = computed(() => (cfg.value?.railCards?.length ? cfg.value.railCards : props.railCards))
const effHeaderVariant = computed(() => cfg.value?.headerVariant ?? props.headerVariant)
const effWidth = computed(() => cfg.value?.width ?? props.width)
const banners = computed(() => (cfg.value ? cfg.value.banners(props.record) : []))
```

(d) Replace the references in the existing `useDetailLayout({...})` call and the `hasTabs`/`showRail` computeds and the template so they use the `eff*` computeds. Concretely:

- Change `actions: () => props.actions` → `actions: () => effActions.value`.
- Change `hasTabs` to `computed(() => effTabs.value.some((t) => t.visible !== false))`.
- Change `showRail` body's `props.railCards.length` → `effRailCards.value.length`.
- In the template, replace `:width="width"` → `:width="effWidth"`; `:icon="breadcrumbs ? null : icon"` → `:icon="effBreadcrumbs ? null : effIcon"`; `:title="breadcrumbs ? '' : title"` → `:title="effBreadcrumbs ? '' : effTitle"`; `v-if="breadcrumbs"` (PageHeader #title) → `v-if="effBreadcrumbs"`; `:items="breadcrumbs"` → `:items="effBreadcrumbs"`; the `DetailHeader` `:title="title"` → `:title="effTitle"`, `:icon="icon"` → `:icon="effIcon"`, `:avatarName="avatarName"` → `:avatarName="effAvatarName"`, `:variant="headerVariant"` → `:variant="effHeaderVariant"`, `:actions="actions"` → `:actions="effActions"`; the `DetailTabs` `:tabs="tabs"` → `:tabs="effTabs"` and its `v-for="t in tabs"` → `v-for="t in effTabs"`; the `DetailRail` `:railCards="railCards"` → `:railCards="effRailCards"`.

(e) Add the banner region inside the ready branch, **between** the sticky-header `</div>` and the grid `<div ...>`:

```html
<BaseBannerRegion v-if="banners.length" :banners="banners" />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/BaseDetailLayout.spec.js`
Expected: PASS (all original + 4 new tests).

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/components/BaseDetailLayout.vue resource/js/shared/components/BaseDetailLayout.spec.js
git commit -m "feat(ds): BaseDetailLayout accepts :config + renders banner region

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `BaseDetailLayout` — variant descriptor, header morph, anchor sections, AI/version seams

**Files:**
- Modify: `resource/js/shared/components/BaseDetailLayout.vue`
- Test: `resource/js/shared/components/BaseDetailLayout.spec.js`

**Interfaces:**
- Consumes: `morphHeaderVariant` (Task 2), `useDetailLayout`'s `variantDescriptor`/`navModel` (Task 5), `DetailAnchorNav` (Task 8).
- Produces: a `variant` prop (String, default `'standard'`); config's `variant` wins. The resolved descriptor controls: breadcrumbs visibility, sticky header, nav visibility, rail visibility/inlining, single-vs-two-column, and `editable`. Scoped slot state gains `variant` and `editable`. Anchor `sections` render stacked with `#section-{id}` slots in `<section :id="'section-'+id">`. AI/version seams render `#ai-summary`, `#ai-panel`, and a version-summary rail card only when the matching config flag is enabled. Stub variants render a `data-test="variant-stub"` marker.

- [ ] **Step 1: Write the failing tests (append to existing spec)**

```js
import { resolveVariant } from '../composables/detailVariantHelpers.js'

describe('BaseDetailLayout — variants', () => {
  it('readonly exposes editable=false to scoped slots', () => {
    const config = defineDetailConfig({ variant: 'readonly' })
    const w = mountLayout({
      props: { config },
      slots: { default: `<template #default="s"><span data-test="ed">{{ String(s.editable) }}</span></template>` },
    })
    expect(w.get('[data-test="ed"]').text()).toBe('false')
  })
  it('embedded hides the rail even when railCards exist', () => {
    const config = defineDetailConfig({ variant: 'embedded', railCards: [{ id: 'p', title: 'Properties' }] })
    const w = mountLayout({ props: { config }, slots: { default: '<div/>' } })
    expect(w.find('aside[aria-label="Details"]').exists()).toBe(false)
  })
  it('renders a stub marker for the approval variant', () => {
    const config = defineDetailConfig({ variant: 'approval' })
    const w = mountLayout({ props: { config }, slots: { default: '<div/>' } })
    expect(w.find('[data-test="variant-stub"]').exists()).toBe(true)
  })
  it('renders anchor sections with their ids and a nav', () => {
    const config = defineDetailConfig({ sections: [{ id: 'details', label: 'Details' }] })
    const w = mountLayout({
      props: { config },
      slots: { 'section-details': '<div data-test="sec">Body</div>' },
    })
    expect(w.find('nav[aria-label="Sections"]').exists()).toBe(true)
    expect(w.find('#section-details').exists()).toBe(true)
    expect(w.get('[data-test="sec"]').text()).toBe('Body')
  })
  it('hides the AI summary slot unless ai.enabled', () => {
    const off = mountLayout({ props: { config: defineDetailConfig({}) }, slots: { default: '<div/>', 'ai-summary': '<div data-test="ai"/>' } })
    expect(off.find('[data-test="ai"]').exists()).toBe(false)
    const on = mountLayout({ props: { config: defineDetailConfig({ ai: { enabled: true } }) }, slots: { default: '<div/>', 'ai-summary': '<div data-test="ai"/>' } })
    expect(on.find('[data-test="ai"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/BaseDetailLayout.spec.js`
Expected: FAIL — no `editable` in slot state, rail still shows, no stub marker, sections not rendered, AI slot ungated.

- [ ] **Step 3: Write minimal implementation**

In `resource/js/shared/components/BaseDetailLayout.vue`:

(a) Extend the import line from Task 9:

```js
import { normalizeDetailConfig } from '../composables/defineDetailConfig.js'
import { morphHeaderVariant } from '../composables/detailVariantHelpers.js'
```

(b) Add the `variant` prop to `defineProps`:

```js
  variant: { type: String, default: 'standard' },
```

(c) Add `effVariant` and feed `variant`, `sections`, `tabs` into the `useDetailLayout` call; destructure the new returns:

```js
const effVariant = computed(() => cfg.value?.variant ?? props.variant)
const effSections = computed(() => cfg.value?.sections ?? [])

const { state, scrolled, isMobile, variantDescriptor, navModel } = useDetailLayout({
  loading: () => props.loading,
  notFound: () => props.notFound,
  error: () => props.error,
  actions: () => effActions.value,
  variant: () => effVariant.value,
  sections: () => effSections.value,
  tabs: () => effTabs.value,
  scrollTarget: scrollEl,
})
```

(d) Add derived structural computeds + active-section scrollspy:

```js
const vd = variantDescriptor // computed { showBreadcrumbs, stickyHeader, showNav, showRail, columns, editable, linearized, stub }
const effHeaderVariantMorphed = computed(() =>
  vd.value.stickyHeader ? morphHeaderVariant(effHeaderVariant.value, scrolled.value) : effHeaderVariant.value,
)
const showRailFinal = computed(() => vd.value.showRail && showRail.value)
const twoCol = computed(() => vd.value.columns === 2 && showRailFinal.value)
const aiEnabled = computed(() => cfg.value?.ai?.enabled === true)
const versionEnabled = computed(() => cfg.value?.version?.enabled === true)

// scrollspy for anchor sections (guarded for jsdom)
const activeSectionId = ref('')
let observer = null
function setupSpy() {
  if (observer) { observer.disconnect(); observer = null }
  if (typeof IntersectionObserver === 'undefined' || !effSections.value.length) return
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) activeSectionId.value = visible[0].target.id.replace('section-', '')
    },
    { root: scrollEl.value, rootMargin: '-20% 0px -70% 0px', threshold: 0 },
  )
  effSections.value.forEach((s) => {
    const el = scrollEl.value?.querySelector(`#section-${s.id}`)
    if (el) observer.observe(el)
  })
}
onMounted(setupSpy)
watch([effSections, () => state.value], () => nextTick(setupSpy))
onBeforeUnmount(() => observer?.disconnect())
```

> Add `nextTick`, `onMounted`, `onBeforeUnmount`, `watch` — all auto-imported, no import line needed.

(e) Extend `slotState`:

```js
const slotState = computed(() => ({
  state: state.value,
  isMobile: isMobile.value,
  activeTab: activeTab.value,
  variant: vd.value.variant,
  editable: vd.value.editable,
}))
```

(f) Template changes inside the ready branch:
- Wrap the sticky header `<div class="tw:sticky ...">` so stickiness is conditional: change its class binding to `:class="vd.stickyHeader ? 'tw:sticky tw:top-0 tw:z-raised tw:bg-main' : 'tw:bg-main'"` and remove the static `tw:sticky tw:top-0 tw:z-raised` from the static class list.
- Use the morphed header variant: `:variant="effHeaderVariantMorphed"`.
- Gate breadcrumbs/header teleport on `vd.showBreadcrumbs`: in the `PageHeader`, guard the breadcrumbs `#title` with `v-if="effBreadcrumbs && vd.showBreadcrumbs"` and pass `:title="effBreadcrumbs && vd.showBreadcrumbs ? '' : effTitle"`, `:icon="effBreadcrumbs && vd.showBreadcrumbs ? null : effIcon"`.
- Add the stub marker right after the header block:
  ```html
  <div v-if="vd.stub" data-test="variant-stub" class="tw:rounded-md tw:border tw:border-dashed tw:border-amber-300 tw:bg-amber-50 tw:px-3 tw:py-1.5 tw:text-caption tw:text-amber-800">
    Variant “{{ vd.variant }}” is not yet implemented — rendering the standard layout.
  </div>
  ```
- Replace the grid column class binding: `:class="twoCol ? 'tw:grid-cols-[minmax(0,1fr)_340px]' : 'tw:grid-cols-1'"`.
- In the main column, render anchor nav + stacked sections **above** the existing tabs/default-slot block:
  ```html
  <template v-if="vd.showNav && effSections.length">
    <DetailAnchorNav :sections="effSections" :activeId="activeSectionId" class="tw:sticky tw:top-16 tw:z-raised tw:bg-main" />
    <section
      v-for="s in effSections"
      :id="`section-${s.id}`"
      :key="s.id"
      class="tw:scroll-mt-32 tw:py-4"
    >
      <slot :name="`section-${s.id}`" v-bind="slotState" />
    </section>
  </template>
  ```
- Guard the existing panel tabs/default with `v-if="vd.showNav"` on the `DetailTabs` (it already checks `hasTabs`); leave the default `<slot>` as the fallback. Change `<DetailTabs v-if="hasTabs" ...>` → `<DetailTabs v-if="vd.showNav && hasTabs" ...>`.
- Gate the rail with `showRailFinal`: change `<DetailRail v-if="showRail" ...>` → `<DetailRail v-if="showRailFinal" ...>`.
- Add the AI body seam after the main column's content (inside the main `<div class="tw:min-w-0">`, after the tabs/sections/default):
  ```html
  <div v-if="aiEnabled && $slots['ai-panel']" class="tw:mt-4"><slot name="ai-panel" v-bind="slotState" /></div>
  ```
- Add AI summary + version seams into the rail. Since the rail content is slot-or-railCards, add them inside `DetailRail`'s slot region by switching the rail to always use the slot when seams or `#rail` are present. Simplest: add the seams **above** `DetailRail` content by passing them through the rail's default slot only when used. To keep this task minimal, render the seams as extra `BaseRailCard`s inside the `DetailRail` default slot wrapper:
  ```html
  <DetailRail v-if="showRailFinal" :railCards="effRailCards" class="tw:lg:sticky tw:lg:top-20 tw:lg:self-start">
    <template v-if="$slots.rail || aiEnabled || versionEnabled" #default>
      <BaseRailCard v-if="aiEnabled && $slots['ai-summary']" title="AI Summary">
        <slot name="ai-summary" v-bind="slotState" />
      </BaseRailCard>
      <BaseRailCard v-if="versionEnabled" title="Version" data-test="version-card">
        <slot name="version-summary" v-bind="slotState"><span class="tw:text-secondary tw:text-body">—</span></slot>
      </BaseRailCard>
      <slot v-if="$slots.rail" name="rail" v-bind="slotState" />
    </template>
  </DetailRail>
  ```
  > Note: when seams are on but no `#rail` slot is provided, the railCards descriptor is ignored in favor of the slot (matches the existing "slot wins" rule). That is acceptable for SP-1; combining descriptor railCards with seams is deferred.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/BaseDetailLayout.spec.js`
Expected: PASS (original + Task 9 + Task 10 tests).

- [ ] **Step 5: Run the full unit suite to catch regressions**

Run: `npm run test`
Expected: PASS — no regressions across the repo's vitest suite.

- [ ] **Step 6: Commit**

```bash
git add resource/js/shared/components/BaseDetailLayout.vue resource/js/shared/components/BaseDetailLayout.spec.js
git commit -m "feat(ds): BaseDetailLayout variants, header morph, anchor nav, AI/version seams

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Deprecate `BaseDetailPage` + standalone `BaseOverviewPanel`

**Files:**
- Modify: `resource/js/shared/components/BaseDetailPage.vue`
- Modify: `resource/js/shared/components/BaseOverviewPanel.vue`
- Test: `resource/js/shared/components/detailDeprecation.spec.js`

**Interfaces:**
- Produces: both components emit a one-time `console.warn` on mount in dev (`import.meta.env.DEV`) pointing to the replacement, and carry an `@deprecated` JSDoc note at the top of `<script setup>`. No prop/slot/behavior change — existing consumers keep working.

- [ ] **Step 1: Write the failing test**

```js
// resource/js/shared/components/detailDeprecation.spec.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseDetailPage from './BaseDetailPage.vue'
import BaseOverviewPanel from './BaseOverviewPanel.vue'

const RouterLinkStub = { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' }

describe('detail deprecation warnings', () => {
  let warn
  beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
  afterEach(() => { warn.mockRestore() })

  it('BaseDetailPage warns on mount pointing to BaseDetailLayout', () => {
    mount(BaseDetailPage, { global: { stubs: { RouterLink: RouterLinkStub } }, slots: { default: '<div/>' } })
    expect(warn.mock.calls.flat().join(' ')).toContain('BaseDetailLayout')
  })

  it('BaseOverviewPanel warns on mount pointing to DetailRail', () => {
    mount(BaseOverviewPanel, { slots: { default: '<div/>' } })
    expect(warn.mock.calls.flat().join(' ')).toContain('DetailRail')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resource/js/shared/components/detailDeprecation.spec.js`
Expected: FAIL — no warning emitted.

- [ ] **Step 3: Write minimal implementation**

At the top of `BaseDetailPage.vue`'s `<script setup>` (after existing imports/props), add:

```js
/** @deprecated Use BaseDetailLayout instead — it supersedes this shell (SP-1). */
onMounted(() => {
  if (import.meta.env?.DEV) {
    console.warn('[deprecation] BaseDetailPage is deprecated; migrate to BaseDetailLayout (see docs/superpowers/specs/2026-06-22-detail-template-core-config-design.md).')
  }
})
```

At the top of `BaseOverviewPanel.vue`'s `<script setup>`, add:

```js
/** @deprecated Use DetailRail + BaseRailCard inside BaseDetailLayout instead (SP-1). */
onMounted(() => {
  if (import.meta.env?.DEV) {
    console.warn('[deprecation] BaseOverviewPanel is deprecated; use DetailRail + BaseRailCard inside BaseDetailLayout.')
  }
})
```

> `onMounted` is auto-imported. If a component lacks a `<script setup>` lifecycle yet, just add the block; do not change any props/slots.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resource/js/shared/components/detailDeprecation.spec.js`
Expected: PASS.

> The warnings use `import.meta.env.DEV`. Vitest sets `DEV` true by default, so the test sees them; production builds also warn only in dev. Existing component specs may now log the warning — that is harmless. If any existing spec asserts "no console.warn", update it to allow the deprecation string.

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/components/BaseDetailPage.vue resource/js/shared/components/BaseOverviewPanel.vue resource/js/shared/components/detailDeprecation.spec.js
git commit -m "chore(ds): deprecate BaseDetailPage + BaseOverviewPanel (non-breaking)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Storybook stories + fixtures

**Files:**
- Modify: `resource/js/shared/components/detailLayout.fixtures.js`
- Modify: `resource/js/shared/components/BaseDetailLayout.stories.js`

**Interfaces:**
- Consumes: `defineDetailConfig`, banner factories, `BaseDetailLayout`.
- Produces: new stories under `Templates/Detail Page` — `ConfigDriven`, `Variants` (readonly/embedded/print/stub), `Banners`, `AnchorNav`, `Seams`. No new runtime exports other than fixtures.

- [ ] **Step 1: Add fixtures**

Append to `resource/js/shared/components/detailLayout.fixtures.js`:

```js
import { IconBuildingFactory2, IconClipboardList } from '@tabler/icons-vue'
import { defineDetailConfig } from '../composables/defineDetailConfig.js'
import { readOnlyBanner, approvalPendingBanner, validationIssuesBanner } from '../composables/bannerFactories.js'

export const ncRecord = {
  id: 'nc-1', title: 'Non conformance testing', statusId: 'DRAFT', ncNumber: 'NC-MAIN-ENG-001',
}

export const ncConfig = defineDetailConfig({
  variant: 'standard',
  header: (r) => ({ title: r.title, icon: IconClipboardList, avatarName: r.title }),
  breadcrumbs: (r) => [{ label: 'Nonconformances', to: '/nonconformances' }, { label: r.ncNumber }],
  banners: (r) => (r.statusId === 'DRAFT' ? [approvalPendingBanner()] : []),
  sections: [
    { id: 'details', label: 'Details', icon: IconClipboardList },
    { id: 'workflow', label: 'Workflow' },
    { id: 'disposition', label: 'Disposition' },
  ],
  tabs: [{ value: 'activity', label: 'Activity', count: () => 4 }],
  railCards: [
    { id: 'props', title: 'Properties', items: [{ label: 'Status', value: 'Draft' }, { label: 'Owner', value: 'Yasin Q.' }] },
  ],
})

export const bannerSet = [readOnlyBanner(), approvalPendingBanner(), validationIssuesBanner(2)]
```

- [ ] **Step 2: Add stories**

Append to `resource/js/shared/components/BaseDetailLayout.stories.js` (import the new fixtures at the top alongside the existing import):

```js
import { ncRecord, ncConfig, bannerSet } from './detailLayout.fixtures.js'
import { defineDetailConfig } from '../composables/defineDetailConfig.js'

export const ConfigDriven = {
  name: 'Config-driven (hybrid API)',
  render: () => ({
    components: { BaseDetailLayout },
    setup: () => ({ ncConfig, ncRecord }),
    template: `
      <div style="height: 680px">
        <BaseDetailLayout :config="ncConfig" :record="ncRecord">
          <template #section-details><div class="tw:text-body">Containment action, severity, type…</div></template>
          <template #section-workflow><div class="tw:text-body">Workflow timeline (SP-4)…</div></template>
          <template #section-disposition><div class="tw:text-body">Disposition decision…</div></template>
          <template #tab-activity><div class="tw:py-4 tw:text-body">Activity feed (SP-2)…</div></template>
        </BaseDetailLayout>
      </div>`,
  }),
}

export const Variants = {
  name: 'Variants (readonly / embedded / print / stub)',
  render: () => ({
    components: { BaseDetailLayout },
    setup: () => ({
      readonly: defineDetailConfig({ variant: 'readonly', header: () => ({ title: 'Read-only record' }), railCards: [{ id: 'p', title: 'Properties', items: [{ label: 'Status', value: 'Closed' }] }] }),
      embedded: defineDetailConfig({ variant: 'embedded', header: () => ({ title: 'Embedded (peek) record' }) }),
      print: defineDetailConfig({ variant: 'print', header: () => ({ title: 'Print layout' }), railCards: [{ id: 'p', title: 'Properties', items: [{ label: 'Status', value: 'Open' }] }] }),
      approval: defineDetailConfig({ variant: 'approval', header: () => ({ title: 'Approval (stub)' }) }),
    }),
    template: `
      <div class="tw:flex tw:flex-col tw:gap-8">
        <div style="height: 280px"><BaseDetailLayout :config="readonly"><template #default><div class="tw:text-body">Body</div></template></BaseDetailLayout></div>
        <div style="height: 240px"><BaseDetailLayout :config="embedded"><template #default><div class="tw:text-body">Body</div></template></BaseDetailLayout></div>
        <div style="height: 280px"><BaseDetailLayout :config="print"><template #default><div class="tw:text-body">Body</div></template></BaseDetailLayout></div>
        <div style="height: 240px"><BaseDetailLayout :config="approval"><template #default><div class="tw:text-body">Body</div></template></BaseDetailLayout></div>
      </div>`,
  }),
}

export const Banners = {
  name: 'Banner region (tones + factories)',
  render: () => ({
    components: { BaseDetailLayout },
    setup: () => ({ config: defineDetailConfig({ header: () => ({ title: 'Record with banners' }), banners: () => bannerSet }) }),
    template: `<div style="height: 460px"><BaseDetailLayout :config="config"><template #default><div class="tw:text-body">Body</div></template></BaseDetailLayout></div>`,
  }),
}

export const Seams = {
  name: 'AI + version seams (enabled)',
  render: () => ({
    components: { BaseDetailLayout },
    setup: () => ({ config: defineDetailConfig({ header: () => ({ title: 'Seams on' }), ai: { enabled: true }, version: { enabled: true } }) }),
    template: `
      <div style="height: 460px">
        <BaseDetailLayout :config="config">
          <template #default><div class="tw:text-body">Body</div></template>
          <template #ai-summary><div class="tw:text-body">AI summary goes here (SP-5).</div></template>
          <template #ai-panel><div class="tw:text-body">AI analysis panel (SP-5).</div></template>
          <template #version-summary><div class="tw:text-body">v1.0 · Yasin Q.</div></template>
        </BaseDetailLayout>
      </div>`,
  }),
}
```

- [ ] **Step 3: Build Storybook to verify the stories compile**

Run: `npm run build-storybook`
Expected: PASS — build completes without errors; `storybook-static/` produced.

- [ ] **Step 4: Eyeball on the running instance (project memory: verify by running)**

Run: `npm run storybook` then open `http://localhost:6006` → `Templates/Detail Page`. Visually confirm: ConfigDriven shows anchor nav + banner + rail; Variants shows readonly (no edit affordance), embedded (no chrome/rail), print (linearized), approval (stub marker); Banners shows three tones; Seams shows AI summary card + AI panel + version card. Note anything off; fix before committing.

- [ ] **Step 5: Commit**

```bash
git add resource/js/shared/components/detailLayout.fixtures.js resource/js/shared/components/BaseDetailLayout.stories.js
git commit -m "docs(ds): Storybook stories for config, variants, banners, seams

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Interaction Rules in CLAUDE.md + final verification

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** none (documentation + verification).

- [ ] **Step 1: Add a detail-page interaction-rules pointer to CLAUDE.md**

Add this section to `CLAUDE.md` after the "Page layout" section:

```markdown
## Detail pages

Every record detail page uses `BaseDetailLayout` (not `BaseDetailPage`, which is deprecated). Declare the page with `defineDetailConfig({...})` (header, banners, sections, tabs, railCards, variant) + slot overrides (`#section-{id}`, `#tab-{value}`, `#rail`, `#ai-summary`/`#ai-panel`/`#version-summary` seams). Rail is `DetailRail` + `BaseRailCard` (not `BaseOverviewPanel`). Full design: `docs/superpowers/specs/2026-06-22-detail-template-core-config-design.md`.

**Interaction rules — pick the surface by intent:**
- Full-page nav → a different record, or a panel-mode tab (heavy dataset) in the same record.
- Drawer (slide-over) → peek a related record without leaving context; a focused sub-task.
- Dialog → a blocking must-resolve decision (confirm destructive, e-signature).
- Popover → lightweight info / small picker anchored to a control.
- Context menu → per-row/per-item secondary actions.
- Inline edit → editing a field of the current record (autosave is the default edit model).
- Expandable section / rail card → optional detail.
- Right rail → glanceable, persistent, ranked metadata + relationships. Never the full edit form, never large datasets.
- Bottom sheet → the mobile substitute for rail and peek.
```

- [ ] **Step 2: Run the full unit suite**

Run: `npm run test`
Expected: PASS — entire vitest suite green.

- [ ] **Step 3: Run lint (includes layout + design-system guards)**

Run: `npm run lint`
Expected: PASS — no eslint, layout, or design-system violations from the new files. Fix any flagged issues (e.g. a missing `tw:` prefix or a non-`function` declaration) and re-run.

- [ ] **Step 4: Build Storybook one final time**

Run: `npm run build-storybook`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: detail-page interaction rules + BaseDetailLayout pointer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- §2 config contract → Task 1 ✅
- §2.4 `mode` on tabs / banner descriptor → Tasks 1, 6 ✅
- §3 banner region + factories → Tasks 3, 6, 7 ✅
- §4 variant switch (standard/readonly/embedded/print + stubs) → Tasks 2, 10 ✅
- §5.1 anchor nav + scrollspy → Tasks 4, 8, 10 ✅
- §5.2 header morph → Tasks 2, 10 ✅
- §6.1 convergence/deprecation → Task 11 ✅
- §6.2 AI/version seams → Task 10 ✅
- §7 interaction rules doc → Task 13 (+ already in the spec file) ✅
- §11 Storybook acceptance + verify-by-running → Tasks 12, 13 ✅
- Note: the spec sketched extending `DetailTabs` with `mode`; this plan instead adds a dedicated `DetailAnchorNav` (documented in "SP-1 scope decisions"). Coverage of the anchor-nav requirement is preserved; the `BaseRailCard` "fold-in" requires no code change (its default slot already renders `BaseDetailSection`/`BaseDetailField`), so it has no task — the convergence is delivered via deprecation (Task 11) + docs (Task 13).

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". Every code step shows complete code. ✅

**3. Type consistency:** `normalizeDetailConfig`→`{config,warnings}` used consistently (Tasks 1, 9). `variantDescriptor` shape from `resolveVariant` (Task 2) matches destructured fields in Task 10 (`showBreadcrumbs/stickyHeader/showNav/showRail/columns/editable/linearized/stub/variant`). `navModel.items[].key/mode` (Task 4) matches `DetailAnchorNav`/section usage. Banner descriptor `{id,tone,icon,title,message,dismissible}` consistent across Tasks 3, 6, 7. `eff*` computed names introduced in Task 9 are reused (not renamed) in Task 10. ✅
