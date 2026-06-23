# Nonconformance Detail Migration (SP-6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `src/components/nonconformances/NonconformancesPageId.vue` onto `BaseDetailLayout` + `defineDetailConfig` (identity-first header, contextual banners, anchor-nav sections, ranked rail) WITHOUT changing any behavior.

**Architecture:** Extract the pure, testable config logic (banner/section/action descriptor builders) into a new `ncDetailConfig.js` helper (TDD). Then relocate the existing page's markup and handlers into `BaseDetailLayout`'s slots region by region — **moving, never rewriting** — so every query, computed, handler, RPC, dialog, and the `isEditable` edit/read duality is preserved verbatim. Each `.vue` region (header → banners → sections → rail → cleanup) is its own reviewable task.

**Tech Stack:** Vue 3.5 `<script setup>` (auto-imported APIs/composables/components), Tailwind v4 (`tw:` prefix), `@tabler/icons-vue` (explicit import), Vitest 4 + `@vue/test-utils`, the SP-1 `BaseDetailLayout`/`defineDetailConfig`.

## Global Constraints

- **pnpm, NOT npm.** `pnpm exec vitest run <path>`, `pnpm exec eslint <files>`, `pnpm test`, `pnpm build`. Never `npm`.
- **IA/layout only — preserve every behavior verbatim.** Do not change any live query, computed, `useAutoSave(nc)`, `editingX` ref, permission/lifecycle gate (`canUpdate`/`isOwner`/`isEditable`/`markCompleteBlockedReason`/`canMarkComplete`/`isOverdue`/`dispositionTracksCost`/`canConvertToSupplier`/`auditIncludeEntities`), action-RPC (`submitForReview`/`markComplete`/`convertSupplierFacing`), `nc.delete()`, handler function, dialog, or workflow component. Relocate them; don't rewrite them.
- **Auto-imports:** components in `resource/js/shared/components/` + `src/components/**`, Vue APIs, composables in `resource/js/shared/composables/` are auto-imported. Icons are NOT — `import { IconX } from '@tabler/icons-vue'`.
- `tw:` prefix on every Tailwind class. `function` keyword for top-level functions. `defineModel` for v-model. PascalCase components. Dates via `dt.formatDate()`.
- **Fidelity check (every `.vue` task):** after editing, the `<script setup>` block's queries/computeds/handlers/RPCs must be unchanged except for relocation. Confirm with a `git diff` review noting no logic changed.
- **No full-mount unit test of the page** (it needs the live syncEngine/router/session — mostly-mock tests assert nothing). The testable logic is isolated into `ncDetailConfig.js` (Task 1). Compile safety = `pnpm exec eslint` per task + `pnpm build` in the final task. **Functional verification = human visual pass on the running authenticated NC page (final task).**
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- Branch: `feat/ds-detail-page-template`.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/components/nonconformances/ncDetailConfig.js` | Pure builders: `buildNcBanners`, `buildNcSections`, `buildNcActions` → descriptor objects/arrays | 1 |
| `src/components/nonconformances/ncDetailConfig.spec.js` | Unit tests for the three builders | 1 |
| `src/components/nonconformances/NonconformancesPageId.vue` | Swap shell→`BaseDetailLayout`; header+actions+banners (T2); anchor sections (T3); rail (T4); cleanup (T5) | 2,3,4,5 |

### Reference: current structure map
The faithful line-range map of the current file (every query/computed/ref/handler/template region) was produced during design. Key blocks the `.vue` tasks relocate, by name:
- **Header actions** (current `#actions` slot): Open NC, Approve & Close, Delete, Print, Audit Log, `AskAiButton`.
- **Alerts**: QC-origin (`v-if="sourceLot"`); supplier-facing chip lives in the NC Details header.
- **Left column cards**: NC Details, `RecordLineagePanel`, `AuditOriginPanel`, `NcWorkflowDraftPreview`/`NcWorkflowDetail`, Disposition, Linked CAPAs.
- **Right column**: `SharedWithPanel`, `NcLinkedComplaintsPanel`, `BaseOverviewPanel` (General/Ownership/Notify/Classification/Schedule/Product impact/Related), NC workflow info card.
- **Dialogs** (kept verbatim as siblings): Mark Complete, E-sign, Open NC, Audit Log, Delete, Convert.

---

### Task 1: Pure config builders — `ncDetailConfig.js`

**Files:**
- Create: `src/components/nonconformances/ncDetailConfig.js`
- Test: `src/components/nonconformances/ncDetailConfig.spec.js`

**Interfaces:**
- Produces:
  - `buildNcBanners(nc, { isEditable, sourceLot, companyPath }) => BannerDescriptor[]` — QC-origin (info, with a `to` action) when `sourceLot`; supplier-facing (info) when `nc.isSupplierFacing`; read-only (neutral) when `!isEditable && ['CLOSED','VOID'].includes(nc.statusId)`. Empty array when none apply / `nc` null.
  - `buildNcSections(nc) => SectionDescriptor[]` — `[{id:'details',label:'Details'},{id:'workflow',label:'Workflow'},{id:'disposition',label:'Disposition'},{id:'capas',label:'CAPAs', visible: nc?.capaRequired === true}]`. (The `capas` item carries a resolved boolean `visible`.)
  - `buildNcActions(gates, handlers) => ActionDescriptor[]` — where `gates = { isOwner, statusId, canMarkComplete, markCompleteBlockedReason, canConvert, saving }` and `handlers = { openOpen, openMarkComplete, openDelete, print, openAudit, openConvert }`. Returns Open NC (primary, visible DRAFT+owner), Approve & Close (primary, visible owner & not DRAFT/CLOSED/VOID, disabled when `!canMarkComplete`, `title` = blocker reason), Print (secondary), Convert (overflow, visible when `canConvert`), Audit Log (overflow), Delete (overflow, danger, visible DRAFT+owner). Each carries `priority` so `useDetailLayout` buckets primary→secondary→overflow.

- [ ] **Step 1: Write the failing test**

```js
// src/components/nonconformances/ncDetailConfig.spec.js
import { describe, it, expect } from 'vitest'
import { buildNcBanners, buildNcSections, buildNcActions } from './ncDetailConfig.js'

describe('buildNcBanners', () => {
  it('returns [] when nc is null', () => {
    expect(buildNcBanners(null, {})).toEqual([])
  })
  it('adds a QC-origin info banner with a link when sourceLot present', () => {
    const b = buildNcBanners({ statusId: 'DRAFT' }, { isEditable: true, sourceLot: { id: 'lot1', lotNumber: 'L-1' }, companyPath: (p) => `/c${p}` })
    const qc = b.find((x) => x.id === 'qc-origin')
    expect(qc.tone).toBe('info')
    expect(qc.actions[0].to).toContain('lot1')
  })
  it('adds a supplier-facing banner when isSupplierFacing', () => {
    const b = buildNcBanners({ statusId: 'UNDER_REVIEW', isSupplierFacing: true }, { isEditable: true })
    expect(b.some((x) => x.id === 'supplier-facing' && x.tone === 'info')).toBe(true)
  })
  it('adds a read-only banner when closed and not editable', () => {
    const b = buildNcBanners({ statusId: 'CLOSED' }, { isEditable: false })
    const ro = b.find((x) => x.id === 'read-only')
    expect(ro.tone).toBe('neutral')
    expect(ro.message.toLowerCase()).toContain('closed')
  })
  it('no read-only banner while editable', () => {
    const b = buildNcBanners({ statusId: 'UNDER_REVIEW' }, { isEditable: true })
    expect(b.some((x) => x.id === 'read-only')).toBe(false)
  })
})

describe('buildNcSections', () => {
  it('always includes details/workflow/disposition', () => {
    const s = buildNcSections({ capaRequired: false })
    expect(s.map((x) => x.id)).toEqual(['details', 'workflow', 'disposition', 'capas'])
    expect(s.find((x) => x.id === 'capas').visible).toBe(false)
  })
  it('marks capas visible only when capaRequired', () => {
    expect(buildNcSections({ capaRequired: true }).find((x) => x.id === 'capas').visible).toBe(true)
  })
})

describe('buildNcActions', () => {
  const handlers = { openOpen() {}, openMarkComplete() {}, openDelete() {}, print() {}, openAudit() {}, openConvert() {} }
  it('shows Open NC (primary) for a DRAFT owner, not Approve', () => {
    const a = buildNcActions({ isOwner: true, statusId: 'DRAFT', canMarkComplete: false, markCompleteBlockedReason: '', canConvert: false, saving: false }, handlers)
    const ids = a.filter((x) => x.visible).map((x) => x.id)
    expect(ids).toContain('open')
    expect(ids).toContain('delete')
    expect(ids).not.toContain('approve')
  })
  it('shows Approve & Close (disabled with reason) for an UNDER_REVIEW owner', () => {
    const a = buildNcActions({ isOwner: true, statusId: 'UNDER_REVIEW', canMarkComplete: false, markCompleteBlockedReason: 'Pick disposition', canConvert: true, saving: false }, handlers)
    const approve = a.find((x) => x.id === 'approve')
    expect(approve.visible).toBe(true)
    expect(approve.disabled).toBe(true)
    expect(approve.title).toBe('Pick disposition')
    expect(a.find((x) => x.id === 'convert').visible).toBe(true)
    expect(a.find((x) => x.id === 'open').visible).toBe(false)
  })
  it('hides owner-only actions for a non-owner', () => {
    const a = buildNcActions({ isOwner: false, statusId: 'DRAFT', canMarkComplete: false, markCompleteBlockedReason: '', canConvert: false, saving: false }, handlers)
    expect(a.find((x) => x.id === 'open').visible).toBe(false)
    expect(a.find((x) => x.id === 'delete').visible).toBe(false)
    expect(a.find((x) => x.id === 'audit').visible).toBe(true) // audit always available
  })
  it('wires onSelect to the provided handlers', () => {
    let opened = false
    const a = buildNcActions({ isOwner: true, statusId: 'DRAFT', canMarkComplete: false, markCompleteBlockedReason: '', canConvert: false, saving: false }, { ...handlers, openOpen: () => { opened = true } })
    a.find((x) => x.id === 'open').onSelect()
    expect(opened).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/nonconformances/ncDetailConfig.spec.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/components/nonconformances/ncDetailConfig.js
import { IconPrinter, IconTrash, IconHistory, IconArrowsExchange } from '@tabler/icons-vue'

/** Contextual banners for an NC (SP-6). Pure — caller resolves nc + gate flags. */
export function buildNcBanners(nc, { isEditable, sourceLot, companyPath } = {}) {
  if (!nc) return []
  const banners = []
  if (sourceLot) {
    const path = `/qc-inspection/lots/${sourceLot.id}`
    banners.push({
      id: 'qc-origin', tone: 'info',
      title: 'Created from QC inspection',
      message: sourceLot.lotNumber ? `Lot ${sourceLot.lotNumber}` : undefined,
      actions: [{ id: 'view-lot', label: 'View inspection results', to: companyPath ? companyPath(path) : path }],
    })
  }
  if (nc.isSupplierFacing) {
    banners.push({ id: 'supplier-facing', tone: 'info', title: 'Supplier-facing', message: 'This NC is shared with the supplier.' })
  }
  if (!isEditable && ['CLOSED', 'VOID'].includes(nc.statusId)) {
    banners.push({ id: 'read-only', tone: 'neutral', title: 'Read-only', message: `This NC is ${nc.statusId.toLowerCase()} and read-only.` })
  }
  return banners
}

/** Anchor-nav sections for the NC body (SP-6). `capas` only when CAPA is required. */
export function buildNcSections(nc) {
  return [
    { id: 'details', label: 'Details' },
    { id: 'workflow', label: 'Workflow' },
    { id: 'disposition', label: 'Disposition' },
    { id: 'capas', label: 'CAPAs', visible: nc?.capaRequired === true },
  ]
}

/** Header action descriptors (SP-6). gates = resolved booleans/strings; handlers = callbacks. */
export function buildNcActions(gates = {}, handlers = {}) {
  const { isOwner, statusId, canMarkComplete, markCompleteBlockedReason, canConvert, saving } = gates
  const notTerminal = !['DRAFT', 'CLOSED', 'VOID'].includes(statusId)
  return [
    { id: 'open', label: 'Open NC', variant: 'primary', priority: 100,
      visible: !!isOwner && statusId === 'DRAFT', disabled: !!saving, onSelect: handlers.openOpen },
    { id: 'approve', label: 'Approve & Close', variant: 'primary', priority: 100,
      visible: !!isOwner && notTerminal, disabled: !canMarkComplete, title: markCompleteBlockedReason || undefined, onSelect: handlers.openMarkComplete },
    { id: 'print', label: 'Print', icon: IconPrinter, variant: 'secondary', priority: 50, visible: true, onSelect: handlers.print },
    { id: 'convert', label: 'Convert to supplier-facing', icon: IconArrowsExchange, variant: 'secondary', priority: 20, visible: !!canConvert, onSelect: handlers.openConvert },
    { id: 'audit', label: 'Audit Log', icon: IconHistory, variant: 'secondary', priority: 15, visible: true, onSelect: handlers.openAudit },
    { id: 'delete', label: 'Delete', icon: IconTrash, variant: 'danger', priority: 10, visible: !!isOwner && statusId === 'DRAFT', onSelect: handlers.openDelete },
  ]
}
```

> Icon choice: use whatever `@tabler/icons-vue` names exist; if `IconArrowsExchange` is absent, pick a near equivalent (`IconExchange`/`IconTransfer`) and note it. A passing test import confirms the names resolve.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/nonconformances/ncDetailConfig.spec.js`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
pnpm exec eslint src/components/nonconformances/ncDetailConfig.js src/components/nonconformances/ncDetailConfig.spec.js
git add src/components/nonconformances/ncDetailConfig.js src/components/nonconformances/ncDetailConfig.spec.js
git commit -m "feat(nc): pure config builders for detail migration (banners/sections/actions)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Shell + header + actions + banners

**Files:**
- Modify: `src/components/nonconformances/NonconformancesPageId.vue`

**Interfaces:**
- Consumes: `buildNcBanners`, `buildNcActions` (Task 1); SP-1 `BaseDetailLayout` (`config`/`record`/slots) + `defineDetailConfig`.
- Produces: the page rendered inside `BaseDetailLayout` with header identity + bucketed actions + banner region; the entire existing body still rendered (via the default slot) so the page keeps working; sections/rail come in Tasks 3–4.

- [ ] **Step 1: Read the current file and confirm the script symbols**

Run: open `src/components/nonconformances/NonconformancesPageId.vue`. Confirm these exist (used below): `nc`, `breadcrumbs`, `loading`, `isOwner`, `isEditable`, `saving`, `canMarkComplete`, `markCompleteBlockedReason`, `canConvertToSupplier`, `sourceLot`, `openOpenDialog`, `openMarkCompleteDialog`, `openPrintView`, `openConvertDialog`, handlers for delete (`showDeleteDialog = true`) and audit (`showAuditLog = true`), `getCompanyPath`. Do not change any of them.

- [ ] **Step 2: Add the config import + computeds to `<script setup>`**

Add the import (top, with other `@/` imports):

```js
import { buildNcBanners, buildNcActions, buildNcSections } from './ncDetailConfig.js'
```

Add these computeds (after the existing gates; they only READ existing reactive state):

```js
const ncBanners = computed(() =>
  buildNcBanners(nc.value, {
    isEditable: isEditable.value,
    sourceLot: sourceLot.value,
    companyPath: getCompanyPath,
  }),
)
const ncActions = computed(() =>
  buildNcActions(
    {
      isOwner: isOwner.value,
      statusId: nc.value?.statusId,
      canMarkComplete: canMarkComplete.value,
      markCompleteBlockedReason: markCompleteBlockedReason.value,
      canConvert: canConvertToSupplier.value,
      saving: saving.value,
    },
    {
      openOpen: openOpenDialog,
      openMarkComplete: openMarkCompleteDialog,
      openDelete: () => { showDeleteDialog.value = true },
      print: openPrintView,
      openAudit: () => { showAuditLog.value = true },
      openConvert: openConvertDialog,
    },
  ),
)
const ncDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbs.value,
    banners: () => ncBanners.value,
    actions: ncActions.value,
    sections: buildNcSections(nc.value),
  }),
)
```

> `defineDetailConfig` is auto-imported (composables dir). If not resolved, add `import { defineDetailConfig } from '@/../resource/js/shared/composables/defineDetailConfig.js'` matching the project's alias for `resource/` — check how other files import shared composables and mirror it.

- [ ] **Step 3: Swap the template shell to `BaseDetailLayout`**

Replace the `<BaseDetailPage :breadcrumbs :loading :notFound width="standard"> … </BaseDetailPage>` wrapper with:

```vue
<BaseDetailLayout :config="ncDetailConfig" :record="nc" :loading="loading" :notFound="!loading && !nc">
  <!-- header identity -->
  <template #title>
    <!-- MOVE the existing inline-editable NC title block here verbatim
         (editingTitle toggle + BaseTextInput + BaseClickableRow, isEditable gate) -->
  </template>
  <template #status>
    <NcStatusBadgeById v-if="nc" :statusId="nc.statusId" />
    <NcSeverityBadgeById v-if="nc?.severityId" :severityId="nc.severityId" />
  </template>
  <template #meta v-if="nc">
    <span class="tw:font-mono">{{ nc.ncNumber }}</span>
    <span v-if="nc.typeId"> · </span><NcTypeBadgeById v-if="nc.typeId" :typeId="nc.typeId" />
    <span v-if="nc.detectedAt"> · Detected {{ dt.formatDate(nc.detectedAt) }}</span>
  </template>
  <!-- actions: bucketed bar (from config.actions) + the bespoke AskAiButton beside it -->
  <template #actions="scope">
    <div class="tw:flex tw:items-center tw:gap-2">
      <DetailActionBar :actions="scope?.actions ?? ncActions" />
      <AskAiButton v-if="nc?.id" entityType="Nonconformance" :entityId="nc.id" :title="nc.title" :number="nc.ncNumber" />
    </div>
  </template>

  <!-- default slot: the ENTIRE existing body, moved unchanged for now (sections/rail in T3/T4) -->
  <template #default>
    <RecordTrailBreadcrumb />
    <!-- MOVE the whole existing 2-column grid body here verbatim -->
  </template>
</BaseDetailLayout>
<!-- the 6 <BaseDialog> blocks remain OUTSIDE/after, exactly as before -->
```

Notes for this step:
- **Move, don't rewrite.** Cut the existing `#actions` button cluster's behavior into `buildNcActions` (already done in Step 2) and the title markup into `#title`. The old QC-origin alert `<div v-if="sourceLot">` is now a banner → DELETE it from the body (it's in `ncBanners`).
- Keep `RecordTrailBreadcrumb` at the top of the body.
- If `BaseDetailLayout` renders the bucketed bar itself from `config.actions` without an `#actions` override, prefer that and append `AskAiButton` via the `#actions` slot only if needed to keep it visible. Verify by reading `DetailHeader.vue`/`DetailActionBar.vue` — use whichever path keeps both the bucketed actions and `AskAiButton`.
- `dt` (luxon formatter) — use the project-wide `dt.formatDate`; confirm how it's accessed in this file/others and mirror it.

- [ ] **Step 4: Verify compile + lint + fidelity**

Run: `pnpm exec eslint src/components/nonconformances/NonconformancesPageId.vue`
Expected: clean.
Run: `git diff` and confirm the `<script setup>` changes are ONLY the new import + the three added computeds + relocation — no existing query/computed/handler/RPC altered. The old QC-origin alert markup is removed (now a banner). All 6 dialogs still present.

- [ ] **Step 5: Commit**

```bash
git add src/components/nonconformances/NonconformancesPageId.vue
git commit -m "feat(nc): migrate shell to BaseDetailLayout — header, actions, banners

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Anchor-nav body sections

**Files:**
- Modify: `src/components/nonconformances/NonconformancesPageId.vue`

**Interfaces:**
- Consumes: the Task 2 shell (config already has `sections` from `buildNcSections`).
- Produces: the left-column body content split into `#section-details`, `#section-workflow`, `#section-disposition`, `#section-capas` slots; the default slot no longer carries the body.

- [ ] **Step 1: Move the body cards into section slots**

Inside `<BaseDetailLayout>`, replace the single `#default` body with section slots. Move existing markup verbatim:

```vue
<template #section-details>
  <RecordLineagePanel :id="id" type="Nonconformance" />
  <AuditOriginPanel entityType="Nonconformance" :entityId="id" />
  <!-- MOVE the NC Details card body here: description, severity/type/source/detected grid,
       containment action — keep all editingX toggles + isEditable gates verbatim.
       (The NC title moved to the header in Task 2; do not duplicate it here.) -->
</template>
<template #section-workflow>
  <NcWorkflowDraftPreview v-if="!workflowInstance && nc?.statusId === 'DRAFT'" :ncId="id" :isOwner="isOwner" />
  <NcWorkflowDetail v-else :ncId="id" :workflowInstanceId="workflowInstance?.id" :isOwner="isOwner" />
</template>
<template #section-disposition>
  <!-- MOVE the Disposition card body here verbatim (disposition type, CAPA-required,
       cost/credit gated by dispositionTracksCost + editingCost/Credit, notes) -->
</template>
<template #section-capas>
  <!-- MOVE the Linked CAPAs card here verbatim (the v-if="nc.capaRequired === true" block,
       list + Create CAPA / Create Change Request buttons). Keep its own v-if too. -->
</template>
```

Keep `RecordTrailBreadcrumb` — render it once at the top of `#section-details` (or leave in a small `#default` if the layout still renders default alongside sections; verify against `BaseDetailLayout.vue` — sections render in addition to/instead of default). If default no longer renders when sections exist, put `RecordTrailBreadcrumb` at the very top of `#section-details`.

- [ ] **Step 2: Verify compile + lint + fidelity**

Run: `pnpm exec eslint src/components/nonconformances/NonconformancesPageId.vue` → clean.
Run: `git diff` — confirm only relocation of body markup into section slots; no logic/handler changes; the Disposition cost/credit gating and edit toggles intact; the CAPAs `v-if` intact.

- [ ] **Step 3: Commit**

```bash
git add src/components/nonconformances/NonconformancesPageId.vue
git commit -m "feat(nc): body into anchor-nav sections (details/workflow/disposition/capas)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Ranked context rail

**Files:**
- Modify: `src/components/nonconformances/NonconformancesPageId.vue`

**Interfaces:**
- Consumes: the Task 3 sections.
- Produces: the right-column panels relocated into `BaseDetailLayout`'s `#rail` slot as re-ranked `BaseRailCard`s; the old `BaseOverviewPanel` two-column grid is gone.

- [ ] **Step 1: Move the right column into the `#rail` slot**

Add a `#rail` slot inside `<BaseDetailLayout>`. Move the existing right-column content into `BaseRailCard`s in this rank order, **preserving every field's edit/read duality + `isEditable` gating + selectors/badges verbatim**:

```vue
<template #rail>
  <BaseRailCard title="Status & schedule">
    <!-- MOVE: General (NC number, status + marked-complete chip) + Schedule (due date + isOverdue indicator) fields -->
  </BaseRailCard>
  <BaseRailCard title="People">
    <!-- MOVE: Ownership section — initiator, responsible party, site, department -->
  </BaseRailCard>
  <BaseRailCard title="Classification">
    <!-- MOVE: Classification — priority, issue type -->
  </BaseRailCard>
  <BaseRailCard title="Notify (cc)">
    <NotificationCcField v-model:groupIds="nc.notifyGroupIds" v-model:userIds="nc.notifyUserIds" :editable="isEditable" />
  </BaseRailCard>
  <BaseRailCard title="Product impact" :defaultOpen="false">
    <!-- MOVE: Product impact section verbatim (supplier, supplier-facing + Convert path, product, qty+UOM, PO/Order/Lot) -->
  </BaseRailCard>
  <BaseRailCard title="Related">
    <!-- MOVE: Related (CAPA required state), NcLinkedComplaintsPanel, NC workflow info card, and SharedWithPanel (v-if nc.isSupplierFacing) -->
  </BaseRailCard>
</template>
```

Notes:
- Use `BaseDetailField`/`BaseText` inside the cards exactly as the old `BaseDetailSection` used them — the markup moves; only the wrapping container changes from `BaseOverviewPanel`/`BaseDetailSection` to `BaseRailCard`.
- Delete the now-empty old right-column `<div>` and the `BaseOverviewPanel` wrapper.
- `SharedWithPanel`, `NcLinkedComplaintsPanel`, the workflow info card keep their own `v-if` guards.

- [ ] **Step 2: Verify compile + lint + fidelity**

Run: `pnpm exec eslint src/components/nonconformances/NonconformancesPageId.vue` → clean.
Run: `git diff` — confirm every rail field's control + `isEditable`/edit-toggle is preserved; only the container wrappers changed; no `BaseOverviewPanel` left; no logic changes.

- [ ] **Step 3: Commit**

```bash
git add src/components/nonconformances/NonconformancesPageId.vue
git commit -m "feat(nc): relocate right column into ranked BaseDetailLayout rail

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Cleanup + full verification + human-visual handoff

**Files:**
- Modify: `src/components/nonconformances/NonconformancesPageId.vue` (cleanup only)

- [ ] **Step 1: Remove dead code**

Remove any now-unused imports (e.g. `BaseDetailPage` if no longer referenced, `BaseOverviewPanel`, `BaseDetailSection` if fully replaced) and any leftover empty wrappers/classes (the old `tw:p-5 tw:grid tw:grid-cols-[65fr_16fr]` containers). Do NOT remove anything still referenced. Keep all dialogs, handlers, queries.

- [ ] **Step 2: Lint the file + run the helper tests**

Run: `pnpm exec eslint src/components/nonconformances/NonconformancesPageId.vue src/components/nonconformances/ncDetailConfig.js`
Expected: clean.
Run: `pnpm exec vitest run src/components/nonconformances/ncDetailConfig.spec.js`
Expected: PASS.

- [ ] **Step 3: Full repo gates**

Run: `pnpm test`
Expected: green except the known pre-existing `BaseBadge` failure.
Run: `pnpm lint`
Expected: clean (eslint + layout + design-system). Fix any violation introduced by this file; do not touch unrelated files.
Run: `pnpm build`
Expected: production build completes (this compiles the migrated `.vue` and catches any template/import error the per-file eslint missed).

- [ ] **Step 4: Commit**

```bash
git add src/components/nonconformances/NonconformancesPageId.vue
git commit -m "chore(nc): cleanup dead wrappers after BaseDetailLayout migration

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Human visual verification (mandatory — auth-gated live page)**

This page cannot be functionally verified by unit tests (live syncEngine/router/session). Hand off to the human to run the app, log in, open a Nonconformance, and confirm:
- Header: title (inline-edit + autosave), status + severity badges, NC#/type/detected meta, and the correct primary action per status (Open NC for DRAFT / Approve & Close otherwise, with the blocker tooltip), Print, overflow (Delete/Audit Log/Convert), and Ask AI.
- Banners: QC-origin (with working link) on a QC-sourced NC; supplier-facing on a supplier NC; read-only on a CLOSED/VOID NC.
- Sections: anchor nav jumps to Details/Workflow/Disposition/CAPAs; Workflow shows draft preview (DRAFT) or active steps; Disposition cost/credit gating; CAPAs section appears only when CAPA required.
- Rail: all fields edit + autosave; Product impact collapsed by default; supplier/complaints/workflow-info/shared-with panels show under their conditions.
- Dialogs: Open NC → submitForReview; Approve & Close → e-sign → markComplete; Delete; Convert; Audit Log all work.

Do not mark SP-6 complete until the human confirms.

---

## Self-Review

**1. Spec coverage:**
- §2.1 header (title/status/meta/actions + AskAiButton) → Task 2 ✅
- §2.2 banners → Task 1 (`buildNcBanners`) + Task 2 (wired) ✅
- §2.3 sections → Task 1 (`buildNcSections`) + Task 3 ✅
- §2.4 rail (ranked, `#rail` slot) → Task 4 ✅
- §2.5 variant standard + dialogs preserved → Task 2 (variant) + dialogs untouched throughout ✅
- §1 behavior-preservation constraint → Global Constraints + per-task fidelity `git diff` checks ✅
- §5 acceptance incl. human visual → Task 5 Step 5 ✅

**2. Placeholder scan:** The `<!-- MOVE … -->` markers are deliberate relocation instructions for existing, already-written markup (the file is the source of truth; reproducing 900 lines of its template in the plan would be error-prone and is the anti-pattern of literal duplication). Every NEW artifact (the pure helpers, their tests, the config object, the slot skeleton, the header/meta markup) is given as complete code. No `TBD`/`add error handling`/vague steps.

**3. Type consistency:** `buildNcBanners`/`buildNcSections`/`buildNcActions` signatures in Task 1 match their consumption in Task 2. Banner descriptor shape (`id/tone/title/message/actions`) matches SP-1 `BaseBanner`/`BaseBannerRegion`. Action descriptor fields (`id/label/variant/priority/visible/disabled/title/onSelect/icon`) match `useDetailLayout` bucketing + `DetailActionBar`. Section descriptor (`id/label/visible`) matches `BaseDetailLayout` anchor sections + `#section-{id}` slots.

**Note on test design:** the page itself gets no full-mount unit test (it would be ~all mocks). The genuinely testable logic is isolated into `ncDetailConfig.js` and unit-tested (Task 1); the `.vue` is verified by eslint + `pnpm build` compile + mandatory human visual pass — the honest verification path for a live, integration-heavy page.
