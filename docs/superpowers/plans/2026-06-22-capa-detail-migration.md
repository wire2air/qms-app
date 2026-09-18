# CAPA Detail Page Migration to BaseDetailLayout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `CapasPageId.vue` (~878 LOC) from `BaseDetailPage` + bespoke two-column grid to `BaseDetailLayout` + `defineDetailConfig`, exactly mirroring the Nonconformance migration, without altering any business logic.

**Architecture:** Create a pure `capaDetailConfig.js` builder file (no Vue imports, unit-testable) with `buildCapaBanners`, `buildCapaSections`, and `buildCapaActions`. Add three new computeds (`capaBanners`, `capaActions`, `capaDetailConfig`) to the existing script setup and rewrite the template to use `BaseDetailLayout` slots. All existing queries, computed refs, handlers, RPCs, and dialogs are moved verbatim — IA/layout only.

**Tech Stack:** Vue 3 Composition API, Vitest, BaseDetailLayout + defineDetailConfig, BaseRailCard, @tabler/icons-vue, pnpm

## Global Constraints

- **pnpm, NOT npm** — all commands use `pnpm exec vitest ...`, `pnpm exec eslint ...`
- `function` keyword for all top-level functions — never `const foo = () => {}`
- `tw:` prefix on ALL Tailwind classes — e.g. `tw:flex tw:gap-2`
- Auto-imports are active: no explicit `import { ref, computed, watch } from 'vue'`, no `import BaseRailCard` etc.
- Icons explicit: `import { IconPrinter, ... } from '@tabler/icons-vue'`
- `defineDetailConfig` is auto-imported from the shared composables layer — do NOT add an explicit import for it in the `.vue` file. Import it explicitly only in the plain `.js` config file since it has no auto-import.
- `.formatDate('date')` for date formatting — never `.toISO()` or `.toFormat()`
- No `<form>` elements — only `<div>` + handlers
- PascalCase component names in templates
- Preserve EVERY existing query/computed/handler/RPC verbatim — only relocate markup
- Commit ONCE at the end with trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/components/capas/capaDetailConfig.js` | **CREATE** | Pure builders: `buildCapaBanners`, `buildCapaSections`, `buildCapaActions` |
| `src/components/capas/capaDetailConfig.spec.js` | **CREATE** | Vitest unit tests mirroring ncDetailConfig.spec.js |
| `src/components/capas/CapasPageId.vue` | **MODIFY** | Add 3 computeds + rewrite template to use BaseDetailLayout slots; zero script logic changes |

---

### Task 1: Create `capaDetailConfig.js` and `capaDetailConfig.spec.js` (TDD)

**Files:**
- Create: `src/components/capas/capaDetailConfig.js`
- Create: `src/components/capas/capaDetailConfig.spec.js`

**Interfaces:**
- Produces: `buildCapaBanners(capa, { isEditable })`, `buildCapaSections(capa)`, `buildCapaActions(gates, handlers)` — all pure functions, no Vue/reactive imports

**Reference:** `src/components/nonconformances/ncDetailConfig.js` and `src/components/nonconformances/ncDetailConfig.spec.js` are the exact patterns to mirror.

- [ ] **Step 1: Write the failing spec**

Create `src/components/capas/capaDetailConfig.spec.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildCapaBanners, buildCapaSections, buildCapaActions } from './capaDetailConfig.js'

describe('buildCapaBanners', () => {
  it('returns [] when capa is null', () => {
    expect(buildCapaBanners(null, {})).toEqual([])
  })
  it('adds a supplier-facing info banner when isSupplierFacing', () => {
    const b = buildCapaBanners({ statusId: 'DRAFT', isSupplierFacing: true }, { isEditable: true })
    const sf = b.find((x) => x.id === 'supplier-facing')
    expect(sf).toBeDefined()
    expect(sf.tone).toBe('info')
  })
  it('does NOT add supplier-facing banner when isSupplierFacing is false', () => {
    const b = buildCapaBanners({ statusId: 'DRAFT', isSupplierFacing: false }, { isEditable: true })
    expect(b.some((x) => x.id === 'supplier-facing')).toBe(false)
  })
  it('adds a read-only neutral banner when CLOSED and not editable', () => {
    const b = buildCapaBanners({ statusId: 'CLOSED' }, { isEditable: false })
    const ro = b.find((x) => x.id === 'read-only')
    expect(ro).toBeDefined()
    expect(ro.tone).toBe('neutral')
    expect(ro.message.toLowerCase()).toContain('closed')
  })
  it('adds a read-only neutral banner when CANCELLED and not editable', () => {
    const b = buildCapaBanners({ statusId: 'CANCELLED' }, { isEditable: false })
    const ro = b.find((x) => x.id === 'read-only')
    expect(ro).toBeDefined()
    expect(ro.tone).toBe('neutral')
    expect(ro.message.toLowerCase()).toContain('cancelled')
  })
  it('no read-only banner when editable (PENDING)', () => {
    const b = buildCapaBanners({ statusId: 'PENDING' }, { isEditable: true })
    expect(b.some((x) => x.id === 'read-only')).toBe(false)
  })
  it('no QC-origin banner (CAPA uses RecordLineagePanel not banners)', () => {
    const b = buildCapaBanners({ statusId: 'DRAFT' }, { isEditable: true })
    expect(b.some((x) => x.id === 'qc-origin')).toBe(false)
  })
})

describe('buildCapaSections', () => {
  it('always returns details, workflow, effectiveness', () => {
    const s = buildCapaSections({ statusId: 'DRAFT' })
    expect(s.map((x) => x.id)).toEqual(['details', 'workflow', 'effectiveness'])
  })
  it('all sections have a label', () => {
    const s = buildCapaSections({ statusId: 'PENDING' })
    s.forEach((section) => expect(section.label).toBeTruthy())
  })
  it('all sections are always visible (no gating)', () => {
    const s = buildCapaSections({ statusId: 'CLOSED' })
    s.forEach((section) => expect(section.visible).not.toBe(false))
  })
})

describe('buildCapaActions', () => {
  const handlers = {
    openOpen() {},
    openClose() {},
    openCancel() {},
    print() {},
    createCr() {},
    openAudit() {},
    openDelete() {},
  }

  it('shows open (primary) for DRAFT owner; close and cancel not visible', () => {
    const a = buildCapaActions(
      { isOwner: true, statusId: 'DRAFT', canClose: true, closeDisabledReason: '', canCreateChangeRequest: false, saving: false },
      handlers,
    )
    const visible = a.filter((x) => x.visible).map((x) => x.id)
    expect(visible).toContain('open')
    expect(visible).not.toContain('close')
    expect(visible).not.toContain('cancel')
  })

  it('shows delete for DRAFT owner', () => {
    const a = buildCapaActions(
      { isOwner: true, statusId: 'DRAFT', canClose: true, closeDisabledReason: '', canCreateChangeRequest: false, saving: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'delete').visible).toBe(true)
  })

  it('shows close (primary) and cancel for PENDING owner; open not visible', () => {
    const a = buildCapaActions(
      { isOwner: true, statusId: 'PENDING', canClose: true, closeDisabledReason: '', canCreateChangeRequest: false, saving: false },
      handlers,
    )
    const visible = a.filter((x) => x.visible).map((x) => x.id)
    expect(visible).toContain('close')
    expect(visible).toContain('cancel')
    expect(visible).not.toContain('open')
  })

  it('close is disabled with tooltip when canClose=false', () => {
    const a = buildCapaActions(
      { isOwner: true, statusId: 'PENDING', canClose: false, closeDisabledReason: '2 steps still open.', canCreateChangeRequest: false, saving: false },
      handlers,
    )
    const close = a.find((x) => x.id === 'close')
    expect(close.visible).toBe(true)
    expect(close.disabled).toBe(true)
    expect(close.title).toBe('2 steps still open.')
  })

  it('close has no title when canClose=true and no closeDisabledReason', () => {
    const a = buildCapaActions(
      { isOwner: true, statusId: 'PENDING', canClose: true, closeDisabledReason: '', canCreateChangeRequest: false, saving: false },
      handlers,
    )
    const close = a.find((x) => x.id === 'close')
    expect(close.disabled).toBe(false)
    expect(close.title).toBeUndefined()
  })

  it('hides owner-only actions for a non-owner', () => {
    const a = buildCapaActions(
      { isOwner: false, statusId: 'DRAFT', canClose: false, closeDisabledReason: '', canCreateChangeRequest: false, saving: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'open').visible).toBe(false)
    expect(a.find((x) => x.id === 'delete').visible).toBe(false)
    expect(a.find((x) => x.id === 'audit').visible).toBe(true) // always visible
    expect(a.find((x) => x.id === 'print').visible).toBe(true) // always visible
  })

  it('open has loading=true and disabled=true while saving', () => {
    const a = buildCapaActions(
      { isOwner: true, statusId: 'DRAFT', canClose: false, closeDisabledReason: '', canCreateChangeRequest: false, saving: true },
      handlers,
    )
    const open = a.find((x) => x.id === 'open')
    expect(open.disabled).toBe(true)
    expect(open.loading).toBe(true)
  })

  it('wires onSelect to the provided handlers', () => {
    let opened = false
    const a = buildCapaActions(
      { isOwner: true, statusId: 'DRAFT', canClose: false, closeDisabledReason: '', canCreateChangeRequest: false, saving: false },
      { ...handlers, openOpen: () => { opened = true } },
    )
    a.find((x) => x.id === 'open').onSelect()
    expect(opened).toBe(true)
  })

  it('createCr visible when canCreateChangeRequest and status is not DRAFT', () => {
    const a = buildCapaActions(
      { isOwner: false, statusId: 'PENDING', canClose: false, closeDisabledReason: '', canCreateChangeRequest: true, saving: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'createCr').visible).toBe(true)
  })

  it('createCr NOT visible on DRAFT even when permission granted', () => {
    const a = buildCapaActions(
      { isOwner: false, statusId: 'DRAFT', canClose: false, closeDisabledReason: '', canCreateChangeRequest: true, saving: false },
      handlers,
    )
    expect(a.find((x) => x.id === 'createCr').visible).toBe(false)
  })
})
```

- [ ] **Step 2: Run spec to confirm it fails (file not yet created)**

```bash
pnpm exec vitest run src/components/capas/capaDetailConfig.spec.js
```

Expected: FAIL with "Cannot find module './capaDetailConfig.js'"

- [ ] **Step 3: Create `capaDetailConfig.js`**

Create `src/components/capas/capaDetailConfig.js`:

```js
import { IconPrinter, IconTrash, IconHistory, IconArrowsExchange } from '@tabler/icons-vue'

/** Contextual banners for a CAPA (SP-6). Pure — caller resolves capa + gate flags.
 *  No QC-origin banner — CAPA uses RecordLineagePanel for source context instead.
 */
export function buildCapaBanners(capa, { isEditable } = {}) {
  if (!capa) return []
  const banners = []
  if (capa.isSupplierFacing) {
    banners.push({
      id: 'supplier-facing',
      tone: 'info',
      title: 'Supplier-facing',
      message: 'This CAPA is shared with the supplier.',
    })
  }
  if (!isEditable && ['CLOSED', 'CANCELLED'].includes(capa.statusId)) {
    banners.push({
      id: 'read-only',
      tone: 'neutral',
      title: 'Read-only',
      message: `This CAPA is ${capa.statusId.toLowerCase()} and read-only.`,
    })
  }
  return banners
}

/** Anchor-nav sections for the CAPA body (SP-6). Effectiveness always visible;
 *  the CapaEffectivenessCheckCard self-manages its mode (pre-close vs. active).
 */
export function buildCapaSections(capa) {
  return [
    { id: 'details', label: 'Details' },
    { id: 'workflow', label: 'Workflow' },
    { id: 'effectiveness', label: 'Effectiveness' },
  ]
}

/** Header action descriptors (SP-6). gates = resolved booleans/strings; handlers = callbacks. */
export function buildCapaActions(gates = {}, handlers = {}) {
  const { isOwner, statusId, canClose, closeDisabledReason, canCreateChangeRequest, saving } = gates
  return [
    {
      id: 'open',
      label: 'Open CAPA',
      variant: 'primary',
      priority: 100,
      visible: !!isOwner && statusId === 'DRAFT',
      disabled: !!saving,
      loading: !!saving,
      onSelect: handlers.openOpen,
    },
    {
      id: 'close',
      label: 'Close CAPA',
      variant: 'primary',
      priority: 100,
      visible: !!isOwner && statusId === 'PENDING',
      disabled: !canClose,
      title: closeDisabledReason || undefined,
      onSelect: handlers.openClose,
    },
    {
      id: 'cancel',
      label: 'Cancel CAPA',
      variant: 'secondary',
      priority: 60,
      visible: !!isOwner && statusId === 'PENDING',
      onSelect: handlers.openCancel,
    },
    {
      id: 'print',
      label: 'Print',
      icon: IconPrinter,
      variant: 'secondary',
      priority: 50,
      visible: true,
      onSelect: handlers.print,
    },
    {
      id: 'createCr',
      label: 'Create Change Request',
      icon: IconArrowsExchange,
      variant: 'secondary',
      priority: 20,
      visible: !!canCreateChangeRequest && statusId !== 'DRAFT',
      onSelect: handlers.createCr,
    },
    {
      id: 'audit',
      label: 'Audit Log',
      icon: IconHistory,
      variant: 'secondary',
      priority: 15,
      visible: true,
      onSelect: handlers.openAudit,
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: IconTrash,
      variant: 'danger',
      priority: 10,
      visible: !!isOwner && statusId === 'DRAFT',
      onSelect: handlers.openDelete,
    },
  ]
}
```

- [ ] **Step 4: Run spec to confirm it passes**

```bash
pnpm exec vitest run src/components/capas/capaDetailConfig.spec.js
```

Expected: All tests PASS

- [ ] **Step 5: ESLint the config file**

```bash
pnpm exec eslint src/components/capas/capaDetailConfig.js
```

Expected: No errors or warnings

---

### Task 2: Migrate `CapasPageId.vue` to `BaseDetailLayout`

**Files:**
- Modify: `src/components/capas/CapasPageId.vue`

**Interfaces:**
- Consumes: `buildCapaBanners`, `buildCapaSections`, `buildCapaActions` from `./capaDetailConfig.js`
- Consumes: `defineDetailConfig` (auto-imported from shared composables)

The existing `<script setup>` block stays completely intact except:
1. Add the import line: `import { buildCapaBanners, buildCapaSections, buildCapaActions } from './capaDetailConfig.js'`
2. Add three new computeds at the bottom of the script block (after the last existing computed/ref)
3. Remove unused `IconClipboardList` from the icon import (it was used in the old toolbar, no longer needed — but ONLY if it isn't used anywhere in the new template; check first)

The entire `<template>` block is rewritten using `BaseDetailLayout`.

- [ ] **Step 1: Add import and 3 new computeds to `<script setup>`**

At the top of `<script setup>`, change the existing import line:

**Old:**
```js
import { IconPrinter, IconClipboardList } from '@tabler/icons-vue'
```

**New:**
```js
import { IconPrinter, IconClipboardList } from '@tabler/icons-vue'
import { buildCapaBanners, buildCapaSections, buildCapaActions } from './capaDetailConfig.js'
```

Then at the END of `<script setup>` (after the `onCreateLinkedChangeRequest` function, before `</script>`), add:

```js
// ─── BaseDetailLayout config (SP-6) ──────────────────────────────────────────
const capaBanners = computed(() =>
  buildCapaBanners(capa.value, { isEditable: isEditable.value }),
)
const capaActions = computed(() =>
  buildCapaActions(
    {
      isOwner: isOwner.value,
      statusId: capa.value?.statusId,
      canClose: canClose.value,
      closeDisabledReason: closeDisabledReason.value,
      canCreateChangeRequest: canCreateChangeRequest.value,
      saving: saving.value,
    },
    {
      openOpen: openOpenDialog,
      openClose: openCloseDialog,
      openCancel: openCancelDialog,
      print: openPrintView,
      createCr: onCreateLinkedChangeRequest,
      openAudit() {
        showAuditLog.value = true
      },
      openDelete() {
        showDeleteDialog.value = true
      },
    },
  ),
)
const capaDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: [
      { label: 'CAPAs', to: getCompanyPath('/capas') },
      { label: capa.value?.capaNumber || capa.value?.title || 'Loading…' },
    ],
    banners: () => capaBanners.value,
    actions: capaActions.value,
    sections: buildCapaSections(capa.value),
  }),
)
```

- [ ] **Step 2: Replace the entire `<template>` block**

Replace the complete `<template>…</template>` with the following. This moves all existing markup verbatim into the appropriate slots — nothing is rewritten, only relocated. The old `BaseDetailPage` wrapper, the old grid (`tw:grid tw:grid-cols-1 tw:lg:grid-cols-[65fr_16fr]`), and the old `<template #actions>` inline buttons are removed. Dialogs are preserved as siblings after `</BaseDetailLayout>`.

```vue
<template>
  <BaseDetailLayout
    :config="capaDetailConfig"
    :record="capa"
    :loading="loading"
    :notFound="!loading && !capa"
    notFoundTitle="CAPA not found"
    notFoundDescription="This CAPA could not be found."
  >
    <template #title>
      <BaseTextInput
        v-if="editingTitle && isEditable"
        v-model="capa.title"
        placeholder="CAPA title"
        autofocus
        class="tw:mb-2"
        @blur="editingTitle = false"
      />
      <BaseClickableRow
        v-else
        class="tw:text-base tw:font-semibold tw:text-on-main"
        :class="isEditable ? 'tw:hover:text-primary' : ''"
        :disabled="!isEditable"
        aria-label="Edit CAPA title"
        @click="editingTitle = true"
      >
        {{ capa?.title }}
      </BaseClickableRow>
    </template>

    <template #status>
      <CapaStatusBadgeById v-if="capa" :statusId="capa.statusId" />
      <CapaPriorityBadgeById v-if="capa?.priorityId" :priorityId="capa.priorityId" />
    </template>

    <template v-if="capa" #meta>
      <span class="tw:font-mono">{{ capa.capaNumber }}</span>
      <template v-if="capa.typeId"> · <CapaTypeBadgeById :typeId="capa.typeId" /></template>
      <template v-if="capa.initiatedAt"> · Initiated {{ capa.initiatedAt.formatDate('date') }}</template>
    </template>

    <template #actions>
      <div class="tw:flex tw:items-center tw:gap-2">
        <DetailActionBar :actions="capaActions" />
        <AskAiButton
          v-if="capa?.id"
          entityType="Capa"
          :entityId="capa.id"
          :entityTitle="capa.title"
          :entityNumber="capa.capaNumber"
        />
      </div>
    </template>

    <template v-if="capa" #section-details>
      <RecordTrailBreadcrumb />

      <!-- Related records lineage (NC / complaint / finding → this CAPA).
           Self-hides when there are no links. -->
      <RecordLineagePanel :id="id" type="Capa" />

      <!-- Raised-from-Audit context (scoped): audit header + only the
           findings/failed requirements this CAPA addresses. Self-hides
           when the CAPA didn't originate from an audit. Visible to
           assignees without audits:read — see AuditOriginPanel. -->
      <AuditOriginPanel entityType="Capa" :entityId="id" />

      <!-- CAPA Details card (description + classification grid) -->
      <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
        <div
          class="tw:flex tw:items-center tw:gap-2 tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
        >
          <BaseText variant="overline">CAPA Details</BaseText>
          <!-- At-a-glance indicator of which assignee pool the
               workflow draws from. Mirrors the NC chip — a CAPA
               spawned from a supplier NC inherits both
               isSupplierFacing and supplierId from the source
               (see CapasCreate watch on sourceNc), so this stays
               in sync with how the workflow actually routes its
               non-APPROVAL steps. -->
          <span
            v-if="capa.isSupplierFacing"
            class="tw:text-micro tw:rounded tw:bg-violet-100 tw:text-violet-700 tw:px-1.5 tw:py-0.5 tw:font-normal tw:normal-case"
            title="Supplier-facing: non-approval workflow steps draw from this CAPA's supplier users. Approval steps stay internal."
          >
            Supplier-facing
          </span>
          <span
            v-else
            class="tw:text-micro tw:rounded tw:bg-gray-100 tw:text-secondary tw:px-1.5 tw:py-0.5 tw:font-normal tw:normal-case"
          >
            Internal
          </span>
        </div>

        <BaseRichTextField
          v-model="capa.description"
          :editable="isEditable"
          clickToEdit
          clickToEditLabel="Add a description…"
          placeholder="Add a description…"
          class="tw:mb-4"
        />

        <div class="tw:grid tw:grid-cols-3 tw:gap-3">
          <div class="tw:flex tw:flex-col tw:gap-1">
            <div class="tw:text-xs tw:text-secondary">Priority</div>
            <CapaPriorityBadgeById :priorityId="capa.priorityId" />
          </div>
          <div class="tw:flex tw:flex-col tw:gap-1">
            <div class="tw:text-xs tw:text-secondary">Type</div>
            <CapaTypeBadgeById :typeId="capa.typeId" />
          </div>
          <div class="tw:flex tw:flex-col tw:gap-1">
            <div class="tw:text-xs tw:text-secondary">Source</div>
            <CapaSourceBadgeById :sourceId="capa.sourceType" />
          </div>
          <div class="tw:flex tw:flex-col tw:gap-1">
            <div class="tw:text-xs tw:text-secondary">Initiated</div>
            <span class="tw:text-sm tw:font-medium">
              {{ capa.initiatedAt?.formatDate('date') || '—' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Admin-defined custom fields. Self-hides when none configured. -->
      <CustomFieldsCard entityType="Capa" :entityId="id" :editable="isEditable" />
    </template>

    <template v-if="capa" #section-workflow>
      <!-- Workflow steps. In DRAFT (no instance yet) we render the
           template-step preview so the owner can plan assignments.
           Once they Submit, the workflow instance exists and the
           live CapaWorkflowDetail takes over. -->
      <CapaWorkflowDraftPreview
        v-if="!workflowInstance && capa?.statusId === 'DRAFT'"
        :capaId="id"
        :isOwner="isOwner"
      />
      <CapaWorkflowDetail
        v-else
        :capaId="id"
        :workflowInstanceId="workflowInstance?.id"
        :isOwner="isOwner"
      />
    </template>

    <template v-if="capa" #section-effectiveness>
      <!-- Effectiveness Check (post-closure follow-up) -->
      <CapaEffectivenessCheckCard :capaId="id" :isOwner="isOwner" />

      <!-- External access — read-only panel populated by workflow-
           step assignment (autoShareSupplierUsers). The product
           decision (2026-05-29) is that supplier visibility on CAPA
           is workflow-driven, not manual. See SharedWithPanel.vue.
           Only relevant on supplier-facing CAPAs — external access is
           only ever granted on those, so hide the section otherwise. -->
      <SharedWithPanel v-if="capa?.isSupplierFacing" entityType="Capa" :entityId="id" />
    </template>

    <template v-if="capa" #rail>
      <!-- 1. Status & schedule -->
      <BaseRailCard title="Status &amp; schedule">
        <BaseDetailField label="Number">
          <BaseText variant="body" weight="medium" class="tw:font-mono tw:break-words">
            {{ capa.capaNumber }}
          </BaseText>
        </BaseDetailField>
        <BaseDetailField label="Status">
          <CapaStatusBadgeById :statusId="capa.statusId" />
        </BaseDetailField>
        <BaseDetailField label="Due">
          <BaseDateField v-if="isEditable" v-model="capa.dueDate" mode="date" class="tw:w-full" />
          <BaseText
            v-else
            variant="body"
            weight="medium"
            :class="isOverdue ? 'tw:text-red-600' : ''"
          >
            {{ capa.dueDate?.formatDate('date') || '—' }}
          </BaseText>
        </BaseDetailField>
        <BaseDetailField
          v-if="capa.verifiedAt"
          label="Verified"
          :value="capa.verifiedAt.formatDate('dateTime')"
        />
        <BaseDetailField
          v-if="capa.closedAt"
          label="Closed"
          :value="capa.closedAt.formatDate('dateTime')"
        />
      </BaseRailCard>

      <!-- 2. People -->
      <BaseRailCard title="People">
        <!-- Initiator = who raised the CAPA (createdBy, immutable). -->
        <BaseDetailField label="Initiator">
          <UserBadgeById v-if="capa.createdBy" :userId="capa.createdBy" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <!-- Responsible party = drives the CAPA to closure; effectiveness
             checks + default workflow assignment route here. -->
        <BaseDetailField label="Responsible party">
          <UserSelectMenu v-if="isEditable" v-model="capa.ownerId" :required="true" />
          <UserBadgeById v-else-if="capa.ownerId" :userId="capa.ownerId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Site">
          <SiteSelectMenu v-if="isEditable" v-model="capa.siteId" :required="true" />
          <SiteBadgeById v-else-if="capa.siteId" :siteId="capa.siteId" />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField label="Department">
          <DepartmentSelectMenu
            v-if="isEditable"
            v-model="capa.departmentId"
            :required="true"
          />
          <DepartmentBadgeById
            v-else-if="capa.departmentId"
            :departmentId="capa.departmentId"
          />
          <BaseText v-else color="secondary">—</BaseText>
        </BaseDetailField>
        <BaseDetailField v-if="capa.supplierId" label="Supplier">
          <SupplierBadgeById :supplierId="capa.supplierId" />
        </BaseDetailField>
      </BaseRailCard>

      <!-- 3. Notify (cc) — groups/people emailed + in-app on status change -->
      <BaseRailCard title="Notify (cc)">
        <NotificationCcField
          v-model:groupIds="capa.notifyGroupIds"
          v-model:userIds="capa.notifyUserIds"
          :editable="isEditable"
          hint=""
        />
      </BaseRailCard>

      <!-- 4. Related — workflow template link + SharedWithPanel -->
      <BaseRailCard v-if="(workflow && workflowVersion) || capa.isSupplierFacing" title="Related">
        <!-- Workflow template card -->
        <RouterLink
          v-if="workflow && workflowVersion"
          :to="
            getCompanyPath(
              `/workflow-templates/${workflow.id}?version=${encodeURIComponent(
                workflowVersionLabel(workflowVersion),
              )}`,
            )
          "
          class="tw:flex tw:flex-col tw:gap-2 tw:hover:text-primary tw:transition-colors"
        >
          <div class="tw:text-xs tw:text-secondary tw:uppercase tw:font-semibold">
            Workflow template
          </div>
          <div class="tw:flex tw:items-center tw:justify-between tw:gap-2">
            <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:truncate">
              {{ workflow.name }}
            </span>
            <span
              class="tw:text-xs tw:font-mono tw:text-secondary tw:bg-main-hover tw:px-2 tw:py-0.5 tw:rounded"
            >
              v{{ workflowVersionLabel(workflowVersion) }}
            </span>
          </div>
        </RouterLink>
      </BaseRailCard>
    </template>

    <!-- ─── Dialogs (siblings after </BaseDetailLayout>) ──────────────── -->

    <BaseDialog v-model="showCloseDialog" title="Close CAPA" maxWidth="lg">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <!-- Gate 1: workflow step completion -->
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:border"
          :class="
            incompleteStepCount === 0
              ? 'tw:bg-green-50 tw:border-green-200'
              : 'tw:bg-red-50 tw:border-red-200'
          "
        >
          <div
            class="tw:shrink-0 tw:mt-0.5 tw:font-bold"
            :class="incompleteStepCount === 0 ? 'tw:text-green-600' : 'tw:text-red-600'"
          >
            {{ incompleteStepCount === 0 ? '✓' : '⚠' }}
          </div>
          <div
            class="tw:text-sm"
            :class="incompleteStepCount === 0 ? 'tw:text-green-800' : 'tw:text-red-800'"
          >
            <template v-if="incompleteStepCount === 0">
              All workflow steps and sub-tasks are complete.
            </template>
            <template v-else>
              <strong>{{ incompleteStepCount }}</strong> workflow step{{
                incompleteStepCount === 1 ? '' : 's'
              }}
              still open. Complete, skip, or cancel them before closing.
            </template>
          </div>
        </div>

        <!-- Gate 2: effectiveness check date -->
        <BaseField label="Effectiveness Check Date" required>
          <p class="tw:text-xs tw:text-secondary tw:mb-2">
            When should the corrective action's effectiveness be verified? Industry standard is 90
            days from close.
          </p>
          <div class="tw:flex tw:flex-wrap tw:gap-2 tw:mb-3">
            <button
              v-for="preset in EC_PRESETS"
              :key="preset.days"
              type="button"
              class="tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-medium tw:border tw:transition-colors"
              :class="
                !closeEcCustomDate && closeEcPresetDays === preset.days
                  ? 'tw:bg-primary tw:text-white tw:border-primary'
                  : 'tw:bg-white tw:text-secondary tw:border-divider tw:hover:bg-main-hover'
              "
              @click="
                () => {
                  closeEcPresetDays = preset.days
                  closeEcCustomDate = null
                }
              "
            >
              {{ preset.label }}
            </button>
          </div>
          <div class="tw:flex tw:items-center tw:gap-2">
            <span class="tw:text-xs tw:text-secondary">Or pick a specific date:</span>
            <BaseDateField v-model="closeEcCustomDate" mode="date" />
          </div>
          <p v-if="closeEffectivenessDate" class="tw:text-xs tw:text-secondary tw:mt-2">
            Will schedule for: <strong>{{ closeEffectivenessDate.formatDate('date') }}</strong>
          </p>
        </BaseField>

        <!-- Optional closure comments -->
        <BaseField v-slot="{ id: fieldId }" label="Closure Comments" optional>
          <BaseTextarea
            :id="fieldId"
            v-model="closeComments"
            :rows="3"
            placeholder="Summary of the corrective action and verification of completion"
          />
        </BaseField>

        <!-- CFR 21 Part 11 notice -->
        <div
          class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-xs tw:text-blue-800"
        >
          <div class="tw:shrink-0 tw:mt-0.5">🔒</div>
          <div>
            CFR 21 Part 11 — Closing this CAPA finalises the controlled record and requires an
            e-signature. You'll be prompted to confirm your identity on the next step.
          </div>
        </div>

        <p v-if="saveError" class="tw:text-xs tw:text-red-600">{{ saveError }}</p>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Sign & Close CAPA"
          submitVariant="danger"
          :loading="closing"
          :disabled="!canClose"
          :submitTitle="canClose ? undefined : closeDisabledReason"
          @cancel="close"
          @submit="handleCloseCapa"
        />
      </template>
    </BaseDialog>

    <!-- E-sign dialog — used for both Close and Cancel. CFR-11 §11.100
         (unique user signature) + §11.200 (two ID components). The
         pendingEsignAction flag routes the @verified callback to the
         right controller. -->
    <WorkflowInstanceEsignAuthDialog v-model="showEsignDialog" @verified="onEsignVerified" />

    <!-- Audit Log Dialog — CAPA + its WorkflowInstance, steps and
         effectiveness checks all roll up into one timeline. -->
    <AuditLogDialog
      v-model="showAuditLog"
      :includeEntities="auditIncludeEntities"
      :title="`Audit Log — ${capa?.capaNumber ?? 'CAPA'}`"
    />

    <BaseDialog v-model="showCancelDialog" title="Cancel CAPA" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200"
        >
          <div class="tw:text-amber-600 tw:shrink-0 tw:mt-0.5">⚠</div>
          <div class="tw:text-sm tw:text-amber-800">
            Cancelling will abort any in-progress workflow and mark the CAPA cancelled. The reason
            below is recorded on the row and in the audit log.
          </div>
        </div>
        <BaseField v-slot="{ id: fieldId }" label="Reason">
          <BaseTextarea
            :id="fieldId"
            v-model="cancelReason"
            :rows="3"
            placeholder="Why is this CAPA being cancelled?"
          />
        </BaseField>
        <!-- CFR 21 Part 11 notice -->
        <div
          class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:text-xs tw:text-blue-800"
        >
          <div class="tw:shrink-0 tw:mt-0.5">🔒</div>
          <div>
            CFR 21 Part 11 — Cancelling a CAPA is a regulated decision and requires an e-signature.
            You'll confirm your identity on the next step.
          </div>
        </div>
        <p v-if="saveError" class="tw:text-xs tw:text-red-600">{{ saveError }}</p>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          cancelLabel="Keep Open"
          submitLabel="Sign & Cancel CAPA"
          submitVariant="danger"
          :loading="cancelling"
          :disabled="!cancelReason.trim()"
          @cancel="close"
          @submit="handleCancelCapa"
        />
      </template>
    </BaseDialog>

    <!-- Open CAPA confirmation — Draft → Active transition. -->
    <BaseDialog v-model="showOpenDialog" title="Open CAPA" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <p class="tw:text-sm tw:text-on-main">
          Opening this CAPA starts the assigned workflow and makes it a
          <strong>permanent audit record</strong>.
        </p>
        <ul class="tw:text-sm tw:text-secondary tw:list-disc tw:pl-5 tw:space-y-1">
          <li>Most fields stay editable until the CAPA is closed.</li>
          <li>It can no longer be deleted — only closed or cancelled with a recorded reason.</li>
          <li>The workflow's first step becomes active and reviewers get tasks.</li>
        </ul>
        <div
          v-if="saveError"
          class="tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-700 tw:rounded-md tw:p-2 tw:text-sm"
        >
          {{ saveError }}
        </div>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Open CAPA"
          :loading="saving"
          @cancel="close"
          @submit="handleSubmitForReview"
        />
      </template>
    </BaseDialog>

    <!-- Delete draft CAPA -->
    <BaseDialog v-model="showDeleteDialog" title="Delete Draft CAPA" maxWidth="md">
      <p class="tw:text-sm tw:text-on-main tw:mb-3">
        Delete this draft CAPA? This permanently removes the record. Drafts have no audit history
        yet, so this is safe.
      </p>
      <div
        v-if="saveError"
        class="tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-700 tw:rounded-md tw:p-2 tw:text-sm tw:mb-3"
      >
        {{ saveError }}
      </div>
      <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
        <BaseButton variant="outline" :disabled="deleting" @click="showDeleteDialog = false">
          Cancel
        </BaseButton>
        <BaseButton variant="danger" :disabled="deleting" @click="handleDeleteDraft">
          {{ deleting ? 'Deleting…' : 'Delete' }}
        </BaseButton>
      </div>
    </BaseDialog>
  </BaseDetailLayout>
</template>
```

**Note on `IconClipboardList`:** The old template used `IconClipboardList` in `BaseButton` toolbar items. In the new template, those are replaced by `DetailActionBar` which uses icon descriptors from `buildCapaActions`. The `IconClipboardList` is also used as `:icon="IconClipboardList"` on `BaseDetailPage` — but `BaseDetailLayout` doesn't take an `icon` prop. Leave the import in place for now (ESLint may warn about unused var — if it does, remove it from the import destructure).

- [ ] **Step 3: ESLint the modified page**

```bash
pnpm exec eslint src/components/capas/CapasPageId.vue
```

If `IconClipboardList` triggers an unused-vars warning, remove it from the import:
```js
import { IconPrinter } from '@tabler/icons-vue'
```

Re-run until clean.

- [ ] **Step 4: Run the spec one final time to confirm still passing**

```bash
pnpm exec vitest run src/components/capas/capaDetailConfig.spec.js
```

Expected: All tests PASS

- [ ] **Step 5: Verify git diff shows only the 3 new computeds added to script**

```bash
git diff src/components/capas/CapasPageId.vue
```

Confirm in the diff output:
- The `<script setup>` diff shows ONLY the new import line and the 3 new computeds (`capaBanners`, `capaActions`, `capaDetailConfig`) at the bottom — no changes to any existing query, computed, ref, watch, handler, or RPC.
- All dialogs (`showCloseDialog`, `showCancelDialog`, `showOpenDialog`, `showDeleteDialog`, `showEsignDialog`, `showAuditLog`) remain present in the template.
- `CapaEffectivenessCheckCard` is in `#section-effectiveness`.
- `SharedWithPanel` is in `#section-effectiveness` (conditionally on `isSupplierFacing`).
- `CustomFieldsCard` is in `#section-details`.

- [ ] **Step 6: Write the SDD report**

Create `.superpowers/sdd/capa-report.md` with:
- What was created/moved per region (header slots, body sections, rail, dialogs)
- The script-side diff summary (new computeds only, no logic changes)
- Test and ESLint outputs
- Any unusual adaptations (e.g. `SharedWithPanel` placement in effectiveness section, `IconClipboardList` handling, `Related` rail card conditional visibility)

- [ ] **Step 7: Commit all three files**

```bash
git add src/components/capas/capaDetailConfig.js src/components/capas/capaDetailConfig.spec.js src/components/capas/CapasPageId.vue .superpowers/sdd/capa-report.md
git commit -m "$(cat <<'EOF'
feat(capas): migrate CapasPageId to BaseDetailLayout + capaDetailConfig

Mirrors the NC migration: adds capaDetailConfig.js pure builders
(buildCapaBanners/Sections/Actions), capaDetailConfig.spec.js (all green),
and rewires CapasPageId.vue template into BaseDetailLayout slots. Zero
script logic changes — IA/layout only.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review: Spec Coverage Check

| Spec requirement | Task covering it |
|---|---|
| `buildCapaBanners` — supplier-facing + read-only + null | Task 1 |
| `buildCapaSections` — 3 sections, no gating | Task 1 |
| `buildCapaActions` — all 7 actions with priorities, visibility, loading | Task 1 |
| TDD: spec red → impl green | Task 1 Steps 1-4 |
| `#title` — inline-edit, isEditable gate | Task 2 Step 2 |
| `#status` — CapaStatusBadgeById + CapaPriorityBadgeById | Task 2 Step 2 |
| `#meta` — capaNumber (mono) + type badge + Initiated date | Task 2 Step 2 |
| `#actions` — DetailActionBar + AskAiButton | Task 2 Step 2 |
| `#section-details` — description, priority/type/source grid, RecordLineagePanel, AuditOriginPanel, CustomFieldsCard | Task 2 Step 2 |
| `#section-workflow` — CapaWorkflowDraftPreview / CapaWorkflowDetail | Task 2 Step 2 |
| `#section-effectiveness` — CapaEffectivenessCheckCard + SharedWithPanel (supplier-facing only) | Task 2 Step 2 |
| Rail: Status & schedule (number, status, due, verified, closed) | Task 2 Step 2 |
| Rail: People (initiator, responsible party, site, dept, supplier) | Task 2 Step 2 |
| Rail: Notify (cc) — NotificationCcField | Task 2 Step 2 |
| Rail: Related — workflow template link + SharedWithPanel | Task 2 Step 2 |
| All 6 dialogs preserved as siblings | Task 2 Step 2 |
| ESLint clean | Task 2 Steps 3, 5 |
| Script-side diff shows only 3 new computeds | Task 2 Step 5 |
| Single commit with Co-Authored-By trailer | Task 2 Step 7 |
| SDD report at `.superpowers/sdd/capa-report.md` | Task 2 Step 6 |

**Placeholder scan:** No TBDs, no "similar to", all code blocks complete.

**Type consistency:** `buildCapaActions` handlers keys (`openOpen`, `openClose`, `openCancel`, `print`, `createCr`, `openAudit`, `openDelete`) are consistent between Task 1 (spec) and Task 2 (component computeds). `priorityId` prop on `CapaPriorityBadgeById` confirmed from reading the component. `statusId` prop on `CapaStatusBadgeById` confirmed.

**Notable adaptation from NC:** `SharedWithPanel` is placed in `#section-effectiveness` (not rail "Related") because in the original CAPA page it lived in the main body column (not the right rail) and was thematically adjacent to the effectiveness check. The spec instruction says "Related — SharedWithPanel v-if capa.isSupplierFacing" but the original source puts it in the body. The implementation follows the original source placement (body, in effectiveness section) as primary, but also re-checks during execution whether the spec intent is rail "Related" — if so, move it there and remove from effectiveness section. The plan writer flags this as the one genuine ambiguity.
