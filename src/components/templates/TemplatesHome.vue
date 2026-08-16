<script setup>
/**
 * Templates — one list of everything an admin authors up front (user decision
 * 2026-08-15), across two different entity types:
 *
 *   Workflow templates for RECORD modules (NC, CAPA, Change Control,
 *     Complaint, promoted modules) — the flows that carry work.
 *   Document templates — the content skeleton + lifecycle rules for a
 *     controlled document.
 *
 * Approval flows (Log Book, Audit, QC, Document Control sign-off) are NOT
 * here: they're a different job and live on their own page, so this list stays
 * "the things that define how work is authored" rather than a bucket of
 * everything workflow-shaped. See isApprovalOnlyModule() in workflowModule.js.
 *
 * Rows dispatch by type: a workflow opens the workflow builder, a document
 * template opens the Document Template editor — which is a genuinely
 * different editor, which is why one merged TABLE (rather than one merged
 * editor) is the thing that unifies them.
 */
import {
  IconTemplate,
  IconArrowsShuffle,
  IconArticle,
  IconPlus,
  IconPencil,
  IconCopy,
  IconStarFilled,
  IconStar,
} from '@tabler/icons-vue'
import { copyVersionSteps, newestVersionOf } from '@/components/workflow/workflowVersionCopy.js'
import { toggleWorkflowDefault } from '@/components/workflow/workflowDefault.js'
import {
  ensureTemplateApprovalWorkflow,
  pickAuthoringVersion,
} from '@/components/documentTemplates/documentTemplateApprovalFlow.js'
import { getCompanyPath } from '@/utils/routeHelpers'
import { isAllowed } from '@/utils/currentSession.js'
import { isApprovalOnlyModule } from '@/components/workflow/workflowModule.js'

const router = useRouter()

// Reads are NOT gated here, deliberately. Template tables are tenant-public
// reference data — `document_templates:read` / `workflows_templates:read` do
// not exist as grantable actions (authz.module_actions has only
// create/update/delete for both), so gating on them hides every row from
// anyone who lacks a WRITE verb on that specific module. That is how document
// templates vanished from this list for a role holding workflow grants but no
// document-template grants. RLS already scopes what the query returns; the
// sibling lists (DocumentTemplatesHome, WorkflowsHome) gate nothing either.
// Nav visibility is handled separately, by writeGate in MainSidebar.
const canCreateWorkflow = computed(() => isAllowed(['workflows_templates:create']))
const canCreateDocTemplate = computed(() => isAllowed(['document_templates:create']))

const showWorkflowCreate = ref(false)

// ── Sources ──────────────────────────────────────────────────────────────────
const workflows = useLiveQuery((db) => db.Workflow.where().exec(), {
  models: ['Workflow'],
  initial: [],
})
const docTemplates = useLiveQuery((db) => db.DocumentTemplate.where().exec(), {
  models: ['DocumentTemplate'],
  initial: [],
})

// Module display names, so the merged Type column sorts by what the badge
// actually reads rather than by the raw module id.
const moduleNames = useLiveQuery(
  async (db) => Object.fromEntries((await db.Module.where().exec()).map((m) => [m.id, m.name])),
  { models: ['Module'], initial: {} },
)

// Step counts + current version, per workflow — the "what's in it" column.
const workflowMeta = useLiveQueryWithDeps(
  [() => workflows.value.map((w) => w.id).join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return {}
    const versions = await db.WorkflowVersion.where().exec()
    const steps = await db.WorkflowStep.where().exec()
    const map = {}
    for (const id of idsStr.split(',')) {
      const mine = versions.filter((v) => v.workflowId === id)
      const current = mine.find((v) => v.isCurrent) ?? mine[0]
      map[id] = {
        version: current,
        stepCount: current ? steps.filter((s) => s.workflowVersionId === current.id).length : 0,
      }
    }
    return map
  },
  { models: ['WorkflowVersion', 'WorkflowStep'], initial: {} },
)

// ── Unified rows ─────────────────────────────────────────────────────────────
// Both types collapse to: what it's called, what it applies to, its status,
// and when it changed. Type-specific detail (prefix, review window, version)
// stays in each type's own editor.
//
// TYPE and APPLIES TO used to be two columns — "Workflow / Document" beside
// "Non-Conformance / Prefix SOP". They were saying the same thing twice, since
// a document template can only apply to documents, so they're now one column
// (user request 2026-08-15). `typeLabel` is the sortable plain-text value
// behind the badge the cell actually renders.
const rows = computed(() => {
  const out = []

  for (const w of workflows.value) {
    if (isApprovalOnlyModule(w.moduleId)) continue // → Approval Flows page
    const meta = workflowMeta.value[w.id]
    out.push({
      id: w.id,
      kind: 'WORKFLOW',
      name: w.name,
      description: w.description,
      moduleId: w.moduleId,
      typeLabel: moduleNames.value[w.moduleId] ?? w.moduleId,
      detail: meta?.stepCount ? `${meta.stepCount} steps` : '—',
      // The status that matters here is the CURRENT VERSION's (DRAFT /
      // PUBLISHED), not the workflow row's ACTIVE/ARCHIVED flag — same as
      // WorkflowsTable. A workflow with only a draft version isn't in use
      // yet, and that's what an author needs to see at a glance.
      statusId: meta?.version?.statusId ?? null,
      isDefault: w.isDefault,
      updatedAt: w.updatedAt ?? w.createdAt,
      to: getCompanyPath(`/workflow-templates/${w.id}`),
    })
  }

  for (const t of docTemplates.value) {
    out.push({
      id: t.id,
      kind: 'DOCUMENT',
      name: t.name,
      description: '',
      moduleId: null,
      typeLabel: 'Document',
      detail: t.periodicReviewMonths ? `Review every ${t.periodicReviewMonths}m` : '—',
      statusId: t.statusId,
      isDefault: false,
      updatedAt: t.updatedAt ?? t.createdAt,
      to: getCompanyPath(`/document-templates/${t.id}`),
    })
  }

  return out.sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
})

// ── Filters ──────────────────────────────────────────────────────────────────
const list = useListLayout({
  filters: { kind: null, search: '' },
  total: () => filteredRows.value.length,
  loading: () => workflows.value === undefined || docTemplates.value === undefined,
  empty: () => filteredRows.value.length === 0,
  syncUrl: true,
})

const KIND_OPTIONS = [
  { id: 'WORKFLOW', name: 'Workflow templates' },
  { id: 'DOCUMENT', name: 'Document templates' },
]

const filteredRows = computed(() => {
  const { kind, search } = list.filters.value
  let out = rows.value
  if (kind) out = out.filter((r) => r.kind === kind)
  const q = (search || '').trim().toLowerCase()
  if (q) out = out.filter((r) => r.name?.toLowerCase().includes(q))
  return out
})

const columns = [
  { name: 'name', label: 'TEMPLATE', field: 'name', align: 'left', sortable: true },
  { name: 'typeLabel', label: 'TYPE', field: 'typeLabel', align: 'left', sortable: true },
  { name: 'detail', label: 'CONTENTS', field: 'detail', align: 'left' },
  { name: 'statusId', label: 'STATUS', field: 'statusId', align: 'left', sortable: true },
  { name: 'updatedAt', label: 'UPDATED', field: 'updatedAt', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]
const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'updatedAt', desc: true }])

function openRow(row) {
  router.push(row.to)
}

// Creating differs per type, so the button asks which — a document template
// has its own multi-step create page, a workflow has the guided dialog.
const createItems = computed(() => {
  const items = []
  if (canCreateWorkflow.value) {
    items.push({
      name: 'Workflow template',
      icon: IconArrowsShuffle,
      click: () => (showWorkflowCreate.value = true),
    })
  }
  if (canCreateDocTemplate.value) {
    items.push({
      name: 'Document template',
      icon: IconArticle,
      click: () => router.push(getCompanyPath('/document-templates/create')),
    })
  }
  return items
})

function handleWorkflowCreated(workflow) {
  router.push(getCompanyPath(`/workflow-templates/${workflow.id}`))
}

// ── Clone ────────────────────────────────────────────────────────────────────
// Clone existed on the old Workflows list and was lost when this merged list
// replaced it; document templates never had one at all (user request
// 2026-08-16). Both land on a DRAFT copy in its own editor — never the
// default, never published — so the author reviews before it can be used.
const toast = useToast()
const cloning = ref(false)

const cloneWorkflow = useLiveMutation(async (db, source) => {
  const workflow = db.Workflow.create({
    name: `${source.name} (Copy)`,
    description: source.description ?? '',
    moduleId: source.moduleId,
    statusId: 'ACTIVE',
    isDefault: false,
  })
  await workflow.save()

  const version = db.WorkflowVersion.create({
    workflowId: workflow.id,
    versionMajor: 1,
    versionMinor: 0,
    statusId: 'DRAFT',
  })
  await version.save()

  const sourceVersion = await newestVersionOf(db, source.id)
  await copyVersionSteps(db, sourceVersion?.id, version.id)
  return { to: getCompanyPath(`/workflow-templates/${workflow.id}`), name: workflow.name }
})

const cloneDocumentTemplate = useLiveMutation(async (db, sourceId) => {
  const source = await db.DocumentTemplate.findByPk(sourceId)
  if (!source) throw new Error('Template not found')

  // DRAFT, and with a distinct prefix placeholder: prefix is unique-ish per
  // company and drives document numbering, so silently reusing the source's
  // would have two templates minting the same series.
  const copy = db.DocumentTemplate.create({
    name: `${source.name} (Copy)`,
    prefix: `${source.prefix}-COPY`,
    departmentId: source.departmentId,
    relatedStandardId: source.relatedStandardId,
    trainingAvailable: source.trainingAvailable,
    retrainingOnVersion: source.retrainingOnVersion,
    periodicReviewMonths: source.periodicReviewMonths,
    reviewLimitDays: source.reviewLimitDays,
    approvalLimitDays: source.approvalLimitDays,
    autoEffectiveOnApproval: source.autoEffectiveOnApproval,
    showSectionTitles: source.showSectionTitles,
    // Fresh section ids — they key the editor's v-for and its remove/reorder.
    sections: (source.sections ?? []).map((sec) => ({ ...sec, id: crypto.randomUUID() })),
    statusId: 'DRAFT',
  })
  await copy.save()

  // Its own approval flow, carrying the source's steps rather than a default
  // pair — a clone that silently loses the reviewers isn't a clone.
  const workflow = await ensureTemplateApprovalWorkflow(db, copy)
  const sourceVersion = source.workflowId ? await newestVersionOf(db, source.workflowId) : null
  if (sourceVersion) {
    const versions = await db.WorkflowVersion.where('workflowId', workflow.id).exec()
    const target = pickAuthoringVersion(versions)
    if (target) {
      for (const stale of await db.WorkflowStep.where('workflowVersionId', target.id).exec()) {
        await stale.delete()
      }
      await copyVersionSteps(db, sourceVersion.id, target.id)
    }
  }
  return { to: getCompanyPath(`/document-templates/${copy.id}`), name: copy.name }
})

async function handleClone(row) {
  if (cloning.value) return
  cloning.value = true
  try {
    const result =
      row.kind === 'WORKFLOW'
        ? await cloneWorkflow(rawWorkflow(row.id))
        : await cloneDocumentTemplate(row.id)
    toast.success(`Cloned as "${result.name}" — opening the draft`)
    router.push(result.to)
  } catch (err) {
    toast.error(err?.message || 'Failed to clone')
  } finally {
    cloning.value = false
  }
}

function rawWorkflow(id) {
  return workflows.value.find((w) => w.id === id)
}

// At most one default per (company, module) is enforced by a partial unique
// index, so the previous one must be cleared first — toggleWorkflowDefault
// owns that ordering.
async function handleToggleDefault(row) {
  try {
    toast.success(await toggleWorkflowDefault(rawWorkflow(row.id), workflows.value))
  } catch (err) {
    toast.error(err?.message || 'Failed to update the default workflow')
  }
}

function rowMenuItems(row) {
  const items = [{ name: 'Edit', icon: IconPencil, click: () => openRow(row) }]
  const canClone = row.kind === 'WORKFLOW' ? canCreateWorkflow.value : canCreateDocTemplate.value
  if (canClone) {
    items.push({ name: 'Clone', icon: IconCopy, click: () => handleClone(row) })
  }
  // Only workflows carry a default — a document template has no module to be
  // the default for.
  if (row.kind === 'WORKFLOW' && canCreateWorkflow.value) {
    items.push({
      name: row.isDefault ? 'Remove default' : 'Set as default',
      icon: row.isDefault ? IconStar : IconStarFilled,
      click: () => handleToggleDefault(row),
    })
  }
  return items
}
</script>

<template>
  <BaseListLayout
    title="Templates"
    :icon="IconTemplate"
    subtitle="Workflow templates for records, and document templates — everything authored up front. Approval sign-off flows live under Approval Flows."
    :state="list.state.value"
    :emptyIcon="IconTemplate"
    :emptyTitle="
      list.hasActiveFilters.value ? 'No templates match your filters' : 'No templates yet'
    "
    emptyDescription="Create a workflow template or a document template to get started."
  >
    <template #actions>
      <BaseMenu v-if="createItems.length" :items="createItems">
        <template #trigger>
          <BaseButton variant="primary">
            <template #icon><IconPlus :size="16" /></template>
            Create
          </BaseButton>
        </template>
      </BaseMenu>
    </template>

    <template #filters>
      <BaseFilterBar
        v-model:search="list.filters.value.search"
        searchPlaceholder="Search templates…"
        :showClear="list.hasActiveFilters.value"
        @clear="list.reset"
      >
        <template #filters>
          <div class="tw:w-52">
            <BaseSelect
              v-model="list.filters.value.kind"
              :options="KIND_OPTIONS"
              optionLabel="name"
              optionValue="id"
              nullLabel="All template types"
            />
          </div>
        </template>
      </BaseFilterBar>
    </template>

    <DataTable
      v-model:pagination="pagination"
      v-model:sort="sort"
      :rows="filteredRows"
      :columns="columns"
      rowKey="id"
    >
      <template #body-cell-name="{ row }">
        <BaseClickableRow
          class="tw:flex tw:flex-col tw:min-w-0 tw:max-w-xs"
          :aria-label="`Open ${row.name}`"
          @click="openRow(row)"
        >
          <span class="tw:truncate tw:font-bold tw:text-on-main">
            {{ row.name }}
            <!-- Star rather than the word (user request 2026-08-16): it sits
                 inline with the name and reads at a glance down a long list. -->
            <BaseTooltip
              v-if="row.isDefault"
              content="Default — auto-selected for new records in this module"
            >
              <IconStarFilled
                :size="13"
                class="tw:ml-1 tw:inline tw:align-middle tw:text-amber-500"
                aria-label="Default"
              />
            </BaseTooltip>
          </span>
          <span v-if="row.description" class="tw:text-xs tw:text-secondary tw:line-clamp-1">
            {{ row.description }}
          </span>
        </BaseClickableRow>
      </template>

      <template #body-cell-typeLabel="{ row }">
        <ModuleBadgeById v-if="row.moduleId" :moduleId="row.moduleId" />
        <BaseBadge v-else>{{ row.typeLabel }}</BaseBadge>
      </template>

      <template #body-cell-detail="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ row.detail }}</span>
      </template>

      <template #body-cell-statusId="{ row }">
        <WorkflowVersionStatusBadgeById
          v-if="row.kind === 'WORKFLOW'"
          :statusId="row.statusId"
          showDot
        />
        <DocumentTemplateStatusBadgeById v-else :statusId="row.statusId" showDot />
      </template>

      <template #body-cell-updatedAt="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ row.updatedAt?.formatDate('date') }}</span>
      </template>

      <template #body-cell-actions="{ row }">
        <BaseMenu :items="rowMenuItems(row)" />
      </template>
    </DataTable>
  </BaseListLayout>

  <!-- Kept outside BaseListLayout so it stays mounted in the empty state —
       otherwise you can't create your first template. -->
  <WorkflowGuidedCreateDialog
    v-model="showWorkflowCreate"
    kind="record"
    @created="handleWorkflowCreated"
  />
</template>
