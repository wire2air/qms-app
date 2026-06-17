<script setup>
/**
 * Flat-list editor for audit_requirements on a version.
 *
 * Phase B-2 ships flat — every requirement lives at root with its own
 * displayOrder. Hierarchical (parent_id nesting + drag-to-reorder)
 * comes in Phase B-3 polish. The BE schema + controller already
 * support parent_id today; the UI just doesn't expose it yet.
 *
 * Writes go through REST (POST / PATCH / DELETE
 * /v1/services/auditRequirements). The BE refuses edits against
 * non-DRAFT/REJECTED versions — we mirror that here by hiding the
 * edit affordances when the `readonly` prop is true.
 */
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconClipboardCheck,
  IconSparkles,
  IconLoader2,
} from '@tabler/icons-vue'
import { post, patch, del } from '@/api'
import { canUseAi } from '@/utils/currentSession.js'

const props = defineProps({
  version: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
})

const toast = useToast()
const { confirm } = useConfirm()

const requirements = useLiveQueryWithDeps(
  [() => props.version?.id],
  async (db, [versionId]) => {
    if (!versionId) return []
    const rows = await db.AuditRequirement.where('auditStandardVersionId', versionId).exec()
    return rows
      .filter((r) => !r.deletedAt && r.active !== false)
      .sort(
        (a, b) =>
          (a.displayOrder ?? 1000) - (b.displayOrder ?? 1000) ||
          a.clauseNumber.localeCompare(b.clauseNumber),
      )
  },

  { models: ['AuditRequirement'], initial: [] },
)

// Depth lookup for hierarchical rendering. Each row's depth is
// computed by walking parentId pointers up to a root row; the result
// is memoised across the whole list so we don't recompute for every
// render. Dangling parentIds (parent missing / cycles) fall back to
// depth 0 so the row still renders at root rather than disappearing.
// Depth 0 → no indent, depth 1 → 24px, etc.
const depthByRequirementId = computed(() => {
  const rows = requirements.value ?? []
  const rowById = new Map(rows.map((r) => [r.id, r]))
  const depthById = new Map()
  function compute(row, seen = new Set()) {
    if (depthById.has(row.id)) return depthById.get(row.id)
    if (!row.parentId) {
      depthById.set(row.id, 0)
      return 0
    }
    if (seen.has(row.id)) {
      // Cycle — defensive; the BE controller already guards against
      // self-refs. Treat as root.
      depthById.set(row.id, 0)
      return 0
    }
    const parent = rowById.get(row.parentId)
    if (!parent) {
      depthById.set(row.id, 0)
      return 0
    }
    seen.add(row.id)
    const d = compute(parent, seen) + 1
    depthById.set(row.id, d)
    return d
  }
  for (const r of rows) compute(r)
  return depthById
})

function rowIndentStyle(rowId) {
  const depth = depthByRequirementId.value.get(rowId) ?? 0
  return depth > 0 ? { marginLeft: `${depth * 24}px` } : null
}

// ─── Dialog ────────────────────────────────────────────────────────────
const showEditDialog = ref(false)
const editing = ref(null)
function blankForm(displayOrder = 1000) {
  return {
    clauseNumber: '',
    title: '',
    questions: [],
    observations: [],
    evidenceItems: [],
    peopleToInterview: [],
    departmentId: null,
    categoryId: null,
    description: '',
    guidance: '',
    riskWeight: 1,
    displayOrder,
  }
}
const form = ref(blankForm())
const saving = ref(false)
const newRole = ref('')
// Edit dialog tab: 'clause' (identity + guidance) | 'checklists' (guided audit).
const editTab = ref('clause')

// Guided-audit checklist helpers (questions / observations / evidence all
// share the [{ id, text }] shape).
function addChecklistItem(list) {
  list.push({ id: crypto.randomUUID(), text: '' })
}
function removeChecklistItem(list, idx) {
  list.splice(idx, 1)
}
// Normalize a legacy array/text into [{ id, text }] for the editor.
function toChecklist(arr, fallbackText) {
  if (Array.isArray(arr) && arr.length)
    return arr.map((q) => ({ id: q.id ?? crypto.randomUUID(), text: q.text ?? '' }))
  if (fallbackText)
    return String(fallbackText)
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text) => ({ id: crypto.randomUUID(), text }))
  return []
}
function addRole() {
  const r = newRole.value.trim()
  if (r && !form.value.peopleToInterview.includes(r)) form.value.peopleToInterview.push(r)
  newRole.value = ''
}
function removeRole(idx) {
  form.value.peopleToInterview.splice(idx, 1)
}

function openAdd() {
  if (props.readonly) return
  editing.value = null
  editTab.value = 'clause'
  form.value = blankForm((requirements.value?.length ?? 0) * 100 + 100)
  showEditDialog.value = true
}

function openEdit(row) {
  if (props.readonly) return
  editing.value = row
  editTab.value = 'clause'
  form.value = {
    clauseNumber: row.clauseNumber,
    title: row.title,
    // Migrate legacy single question / free-text evidence into checklists.
    questions: toChecklist(row.questions, row.question),
    observations: toChecklist(row.observations),
    evidenceItems: toChecklist(row.evidenceItems, row.expectedEvidence),
    peopleToInterview: Array.isArray(row.peopleToInterview) ? [...row.peopleToInterview] : [],
    departmentId: row.departmentId ?? null,
    categoryId: row.categoryId ?? null,
    description: row.description ?? '',
    guidance: row.guidance ?? '',
    riskWeight: row.riskWeight ?? 1,
    displayOrder: row.displayOrder ?? 1000,
  }
  showEditDialog.value = true
}

async function handleSave() {
  if (!form.value.clauseNumber.trim()) {
    toast.warning('Clause number is required')
    return
  }
  if (!form.value.title.trim()) {
    toast.warning('Title is required')
    return
  }
  saving.value = true
  try {
    // Drop blank checklist rows.
    const clean = (list) =>
      (list || []).map((q) => ({ id: q.id, text: (q.text || '').trim() })).filter((q) => q.text)
    const questions = clean(form.value.questions)
    const observations = clean(form.value.observations)
    const evidenceItems = clean(form.value.evidenceItems)
    const body = {
      clauseNumber: form.value.clauseNumber.trim(),
      title: form.value.title.trim(),
      questions,
      observations,
      evidenceItems,
      peopleToInterview: form.value.peopleToInterview || [],
      // Derived headlines kept for findings/reports that read the text columns.
      question: questions[0]?.text || null,
      departmentId: form.value.departmentId || null,
      categoryId: form.value.categoryId || null,
      description: form.value.description?.trim() || null,
      guidance: form.value.guidance?.trim() || null,
      expectedEvidence: evidenceItems.map((e) => e.text).join('\n') || null,
      riskWeight: form.value.riskWeight,
      displayOrder: form.value.displayOrder,
    }
    if (editing.value) {
      await patch(`/v1/services/auditRequirements/${editing.value.id}`, body)
      toast.success('Requirement updated')
    } else {
      await post('/v1/services/auditRequirements', {
        ...body,
        auditStandardVersionId: props.version.id,
      })
      toast.success('Requirement added')
    }
    showEditDialog.value = false
  } catch (e) {
    toast.error(e.message || 'Failed to save requirement')
  } finally {
    saving.value = false
  }
}

async function handleDelete(row) {
  if (props.readonly) return
  if (
    !(await confirm({
      title: 'Delete clause',
      message: `Delete clause ${row.clauseNumber} — "${row.title}"? This can be undone via the audit log within the same version.`,
      okLabel: 'Delete',
      danger: true,
    }))
  ) {
    return
  }
  try {
    await del(`/v1/services/auditRequirements/${row.id}`)
    toast.success('Requirement deleted')
  } catch (e) {
    toast.error(e.message || 'Failed to delete requirement')
  }
}

// ─── Inline expanded view ───────────────────────────────────────────────
const expandedIds = ref(new Set())
function toggleExpanded(id) {
  if (expandedIds.value.has(id)) expandedIds.value.delete(id)
  else expandedIds.value.add(id)
  // Trigger reactivity since Set mutations don't notify.
  expandedIds.value = new Set(expandedIds.value)
}

// ─── AI enrichment ──────────────────────────────────────────────────────
// Per-row sync enrich + a bulk "enrich all empty" path that kicks a
// worker job. Both require the version to be editable (the BE refuses
// otherwise, but hiding the affordance here keeps the UI honest), the
// user to hold `auditStandards:update` (implicit in `!readonly`), AND
// `canUseAi` to be true (env flag + tenant opt-in). Without AI the
// buttons are simply absent.

// Per-row spinner — id of the row currently being enriched. Multiple
// concurrent enrich-clicks are blocked at the row level so the user
// gets clear feedback on which row is in flight.
const enrichingRowId = ref(null)
const bulkEnriching = ref(false)

const emptyRowCount = computed(
  () => requirements.value.filter((r) => !r.guidance || !r.expectedEvidence).length,
)

async function handleEnrichRow(row) {
  if (props.readonly || enrichingRowId.value || bulkEnriching.value) return
  enrichingRowId.value = row.id
  try {
    await post(`/v1/services/ai/auditRequirements/${row.id}/enrich`, {})
    // The row update lands via SyncEngine; toast just confirms success.
    toast.success(`Enriched ${row.clauseNumber}`)
    // Auto-expand so the user can see the new guidance.
    expandedIds.value = new Set([...expandedIds.value, row.id])
  } catch (e) {
    toast.error(e.message || 'Enrichment failed')
  } finally {
    enrichingRowId.value = null
  }
}

const showBulkConfirm = ref(false)
function openBulkConfirm() {
  if (props.readonly || bulkEnriching.value) return
  if (emptyRowCount.value === 0) {
    toast.info('No rows need enrichment — every clause has guidance and expected evidence already.')
    return
  }
  showBulkConfirm.value = true
}

async function handleBulkEnrich() {
  showBulkConfirm.value = false
  bulkEnriching.value = true
  try {
    const res = await post(`/v1/services/ai/auditStandardVersions/${props.version.id}/bulkEnrich`, {
      onlyEmpty: true,
    })
    const total = res?.total ?? 0
    toast.success(
      `Bulk enrichment queued for ${total} row${total === 1 ? '' : 's'}. Rows will update in real time as the worker finishes each one.`,
    )
  } catch (e) {
    toast.error(e.message || 'Failed to queue bulk enrichment')
    bulkEnriching.value = false
    return
  }
  // Auto-clear the busy flag once the empty-row count actually
  // drops below the original — the worker's writes flow back via
  // SyncEngine. A 30s safety cap keeps the spinner from hanging if
  // the worker errors silently on every row.
  const initial = emptyRowCount.value
  const stop = watch(emptyRowCount, (now) => {
    if (now < initial) {
      bulkEnriching.value = false
      stop()
    }
  })
  setTimeout(() => {
    if (bulkEnriching.value) {
      bulkEnriching.value = false
      stop()
    }
  }, 30_000)
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <!-- Add affordance (editable only) -->
    <div v-if="!readonly" class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:items-center tw:gap-3">
        <div class="tw:text-xs tw:text-secondary">
          {{ requirements.length }} clause{{ requirements.length === 1 ? '' : 's' }}
        </div>
        <span
          v-if="canUseAi && emptyRowCount > 0"
          class="tw:text-[11px] tw:text-amber-700 tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded tw:px-1.5 tw:py-0.5"
        >
          {{ emptyRowCount }} missing guidance
        </span>
      </div>
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton
          v-if="canUseAi && emptyRowCount > 0"
          variant="outline"
          size="sm"
          :loading="bulkEnriching"
          :disabled="bulkEnriching"
          @click="openBulkConfirm"
        >
          <template #icon><IconSparkles :size="16" /></template>
          Enrich {{ emptyRowCount }} empty
        </BaseButton>
        <BaseButton variant="primary" size="sm" @click="openAdd">
          <template #icon><IconPlus :size="16" /></template>
          Add Requirement
        </BaseButton>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="!requirements.length"
      class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:py-12 tw:text-secondary"
    >
      <IconClipboardCheck :size="36" class="tw:opacity-50" />
      <div class="tw:text-sm tw:font-semibold">No requirements yet</div>
      <div class="tw:text-xs tw:text-center tw:max-w-md">
        {{
          readonly
            ? 'This version has no published clauses.'
            : 'Add the first clause to start authoring this standard. Click "Add Requirement" above.'
        }}
      </div>
    </div>

    <!-- Requirements list -->
    <div v-else class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="row in requirements"
        :key="row.id"
        :style="rowIndentStyle(row.id)"
        class="tw:border tw:border-divider tw:rounded-md tw:bg-main-hover/30"
      >
        <BaseClickableRow
          class="tw:flex tw:items-start tw:gap-3 tw:px-3 tw:py-2.5 tw:cursor-pointer tw:hover:bg-main-hover/60"
          :aria-label="`${expandedIds.has(row.id) ? 'Collapse' : 'Expand'} clause ${row.clauseNumber}`"
          :aria-expanded="expandedIds.has(row.id)"
          @click="toggleExpanded(row.id)"
        >
          <code
            class="tw:text-xs tw:font-mono tw:bg-white tw:text-on-main tw:rounded tw:px-2 tw:py-0.5 tw:font-semibold tw:shrink-0"
          >
            {{ row.clauseNumber }}
          </code>
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:text-sm tw:font-medium tw:text-on-main">{{ row.title }}</div>
            <div v-if="row.question" class="tw:text-xs tw:text-secondary tw:mt-0.5">
              {{ row.question }}
            </div>
            <div
              v-if="row.description && !expandedIds.has(row.id)"
              class="tw:text-xs tw:text-secondary tw:truncate tw:mt-0.5"
            >
              {{ row.description }}
            </div>
          </div>
          <div v-if="!readonly" class="tw:flex tw:items-center tw:gap-1 tw:shrink-0">
            <button
              v-if="canUseAi && (!row.guidance || !row.expectedEvidence)"
              class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-purple-50 tw:hover:text-purple-600 tw:disabled:opacity-50 tw:disabled:cursor-not-allowed"
              :title="enrichingRowId === row.id ? 'Enriching…' : 'Enrich with AI'"
              :disabled="enrichingRowId === row.id || bulkEnriching"
              @click.stop="handleEnrichRow(row)"
            >
              <IconLoader2
                v-if="enrichingRowId === row.id"
                :size="16"
                class="tw:animate-spin tw:text-purple-600"
              />
              <IconSparkles v-else :size="16" />
            </button>
            <button
              class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-white tw:hover:text-primary"
              title="Edit"
              @click.stop="openEdit(row)"
            >
              <IconPencil :size="16" />
            </button>
            <button
              class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-red-50 tw:hover:text-red-600"
              title="Delete"
              @click.stop="handleDelete(row)"
            >
              <IconTrash :size="16" />
            </button>
          </div>
        </BaseClickableRow>

        <!-- Expanded body — read view of every clause attribute, shown in
             both editable and readonly (EFFECTIVE) mode so reviewers can
             inspect the full guided-audit content without an edit button.
             Evidence is rendered ONLY as the checklist (#24); the derived
             expectedEvidence text column is not shown separately. -->
        <div
          v-if="expandedIds.has(row.id)"
          class="tw:px-3 tw:py-3 tw:border-t tw:border-divider tw:flex tw:flex-col tw:gap-3 tw:bg-white"
        >
          <div v-if="row.description">
            <div class="tw:text-[10px] tw:font-bold tw:uppercase tw:text-secondary tw:mb-1">
              Description
            </div>
            <div class="tw:text-sm tw:text-on-main tw:whitespace-pre-line">
              {{ row.description }}
            </div>
          </div>
          <div v-if="row.guidance">
            <div class="tw:text-[10px] tw:font-bold tw:uppercase tw:text-secondary tw:mb-1">
              Guidance
            </div>
            <div class="tw:text-sm tw:text-on-main tw:whitespace-pre-line">
              {{ row.guidance }}
            </div>
          </div>

          <!-- Guided-audit checklists (questions / observations / evidence) —
               each falls back to its legacy free-text column for old rows. -->
          <div
            v-for="cl in [
              { label: 'Questions', items: toChecklist(row.questions, row.question) },
              { label: 'Observations', items: toChecklist(row.observations) },
              {
                label: 'Expected Evidence',
                items: toChecklist(row.evidenceItems, row.expectedEvidence),
              },
            ]"
            :key="cl.label"
          >
            <div v-if="cl.items.length">
              <div class="tw:text-[10px] tw:font-bold tw:uppercase tw:text-secondary tw:mb-1">
                {{ cl.label }}
              </div>
              <ul class="tw:flex tw:flex-col tw:gap-1">
                <li
                  v-for="(item, idx) in cl.items"
                  :key="item.id"
                  class="tw:flex tw:items-start tw:gap-2 tw:text-sm tw:text-on-main"
                >
                  <span
                    class="tw:text-xs tw:text-secondary tw:mt-0.5 tw:w-4 tw:text-right tw:shrink-0"
                  >
                    {{ idx + 1 }}
                  </span>
                  <span class="tw:whitespace-pre-line">{{ item.text }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- People / roles to interview. -->
          <div v-if="row.peopleToInterview && row.peopleToInterview.length">
            <div class="tw:text-[10px] tw:font-bold tw:uppercase tw:text-secondary tw:mb-1">
              People / roles to interview
            </div>
            <div class="tw:flex tw:flex-wrap tw:gap-1.5">
              <span
                v-for="(role, ri) in row.peopleToInterview"
                :key="ri"
                class="tw:inline-flex tw:items-center tw:text-xs tw:bg-main-hover tw:rounded tw:px-2 tw:py-0.5"
              >
                {{ role }}
              </span>
            </div>
          </div>

          <div
            class="tw:flex tw:items-center tw:gap-4 tw:text-xs tw:text-secondary tw:pt-2 tw:border-t tw:border-divider"
          >
            <span
              >Order: <strong>{{ row.displayOrder }}</strong></span
            >
            <span
              >Risk Weight: <strong>{{ row.riskWeight }}</strong></span
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Edit dialog -->
    <BaseDialog
      v-model="showEditDialog"
      :title="editing ? 'Edit Requirement' : 'Add Requirement'"
      maxWidth="3xl"
    >
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <!-- Identity row — always visible across tabs. -->
        <div class="tw:grid tw:grid-cols-[150px_1fr] tw:gap-3">
          <BaseField v-slot="{ id: fieldId }" label="Clause #" required>
            <BaseTextInput :id="fieldId" v-model="form.clauseNumber" placeholder="7.2.1" />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Title" required>
            <BaseTextInput :id="fieldId" v-model="form.title" placeholder="Personnel competency assessment" />
          </BaseField>
        </div>

        <!-- Tabs -->
        <div class="tw:flex tw:gap-1 tw:border-b tw:border-divider">
          <button
            v-for="t in [
              { id: 'clause', label: 'Clause details' },
              { id: 'checklists', label: 'Audit checklists' },
            ]"
            :key="t.id"
            type="button"
            class="tw:px-3 tw:py-2 tw:text-sm tw:font-medium tw:cursor-pointer tw:bg-transparent tw:border-0 tw:border-b-2 tw:-mb-px"
            :class="
              editTab === t.id
                ? 'tw:border-primary tw:text-primary'
                : 'tw:border-transparent tw:text-secondary tw:hover:text-on-main'
            "
            @click="editTab = t.id"
          >
            {{ t.label }}
          </button>
        </div>

        <!-- Tab: Audit checklists -->
        <div v-show="editTab === 'checklists'" class="tw:flex tw:flex-col tw:gap-3">
          <!-- Guided audit: three tick-off checklists the auditor works through —
             Questions (ask/confirm), Observations (watch), Expected Evidence
             (records to collect). All share the [{id,text}] shape. -->
          <div
            v-for="cl in [
              {
                key: 'questions',
                label: 'Questions (checklist)',
                add: 'Add question',
                ph: 'e.g. Is competency assessed and recorded for QMS personnel?',
                empty: 'No questions yet — add the items the auditor will confirm.',
              },
              {
                key: 'observations',
                label: 'Observations (checklist)',
                add: 'Add observation',
                ph: 'e.g. Operators wearing required PPE on the line',
                empty: 'No observations yet — add what the auditor should watch for.',
              },
              {
                key: 'evidenceItems',
                label: 'Expected Evidence (checklist)',
                add: 'Add evidence item',
                ph: 'e.g. Calibration certificates for test equipment',
                empty: 'No evidence items yet — add the records the auditor should collect.',
              },
            ]"
            :key="cl.key"
          >
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-1">
              <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary">{{ cl.label }}</p>
              <button
                type="button"
                class="tw:text-xs tw:font-medium tw:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:inline-flex tw:items-center tw:gap-1"
                @click="addChecklistItem(form[cl.key])"
              >
                <IconPlus :size="13" /> {{ cl.add }}
              </button>
            </div>
            <div v-if="form[cl.key].length" class="tw:flex tw:flex-col tw:gap-1.5">
              <div
                v-for="(item, ii) in form[cl.key]"
                :key="item.id"
                class="tw:flex tw:items-start tw:gap-2"
              >
                <span class="tw:text-xs tw:text-secondary tw:mt-2 tw:w-4 tw:text-right">{{
                  ii + 1
                }}</span>
                <BaseTextInput v-model="item.text" class="tw:flex-1" :placeholder="cl.ph" />
                <button
                  type="button"
                  class="tw:text-red-600 tw:hover:bg-red-50 tw:rounded tw:p-1.5 tw:mt-0.5 tw:cursor-pointer tw:bg-transparent tw:border-0"
                  title="Remove"
                  @click="removeChecklistItem(form[cl.key], ii)"
                >
                  <IconTrash :size="14" />
                </button>
              </div>
            </div>
            <p v-else class="tw:text-xs tw:text-secondary tw:italic">{{ cl.empty }}</p>
          </div>

          <!-- People / roles to interview (free-text roles/titles). -->
          <BaseField label="People / roles to interview">
            <div
              v-if="form.peopleToInterview.length"
              class="tw:flex tw:flex-wrap tw:gap-1.5 tw:mb-1.5"
            >
              <span
                v-for="(role, ri) in form.peopleToInterview"
                :key="ri"
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:bg-main-hover tw:rounded tw:pl-2 tw:pr-1 tw:py-0.5"
              >
                {{ role }}
                <button
                  type="button"
                  class="tw:text-secondary tw:hover:text-red-600 tw:rounded tw:cursor-pointer tw:bg-transparent tw:border-0"
                  @click="removeRole(ri)"
                >
                  <IconX :size="12" />
                </button>
              </span>
            </div>
            <div class="tw:flex tw:items-center tw:gap-2">
              <BaseTextInput
                v-model="newRole"
                class="tw:flex-1"
                placeholder="e.g. Quality Manager, Line Supervisor…"
                @keyup.enter="addRole"
              />
              <BaseButton variant="outline" size="sm" :disabled="!newRole.trim()" @click="addRole">
                Add
              </BaseButton>
            </div>
          </BaseField>
        </div>
        <!-- /Audit checklists tab -->

        <!-- Tab: Clause details -->
        <div v-show="editTab === 'clause'" class="tw:flex tw:flex-col tw:gap-3">
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <BaseField label="Department">
              <DepartmentSelectMenu v-model="form.departmentId" />
            </BaseField>
            <BaseField label="Category">
              <AuditFindingCategorySelectMenu v-model="form.categoryId" />
            </BaseField>
          </div>
          <BaseField v-slot="{ id: fieldId }" label="Description">
            <BaseTextarea
              :id="fieldId"
              v-model="form.description"
              :rows="4"
              placeholder="What the requirement says verbatim. Pasted from the standard text."
            />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Guidance">
            <BaseTextarea
              :id="fieldId"
              v-model="form.guidance"
              :rows="3"
              placeholder="How to interpret / audit this requirement. Internal interpretation notes."
            />
          </BaseField>
          <!-- Expected Evidence is now the checklist above (#24). -->
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <BaseField v-slot="{ id: fieldId }" label="Display Order">
              <BaseTextInput :id="fieldId" v-model.number="form.displayOrder" type="number" :min="0" />
            </BaseField>
            <BaseField
              v-slot="{ id: fieldId }"
              label="Risk Weight"
              hint="1–100. Reserved for risk-based auditing prioritisation."
            >
              <BaseTextInput :id="fieldId" v-model.number="form.riskWeight" type="number" :min="1" :max="100" />
            </BaseField>
          </div>
        </div>
        <!-- /Clause details tab -->
      </div>
      <template #footer="{ close }">
        <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
        <BaseButton variant="primary" :loading="saving" :disabled="saving" @click="handleSave">
          {{ editing ? 'Save' : 'Add Requirement' }}
        </BaseButton>
      </template>
    </BaseDialog>

    <!-- Bulk-enrich confirmation dialog. Surfaces the row count + the
         expected duration before queuing the worker job. The user can
         still hit the per-row Enrich button afterwards to re-author
         any individual clause they want to revise. -->
    <BaseDialog v-model="showBulkConfirm" title="Enrich with AI" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1 tw:text-sm tw:text-on-main">
        <p>
          The AI will author original
          <strong>description</strong>, <strong>guidance</strong>, and
          <strong>expected evidence</strong> for
          <strong>{{ emptyRowCount }}</strong>
          row{{ emptyRowCount === 1 ? '' : 's' }} on this draft version that don't have them yet.
        </p>
        <p class="tw:text-xs tw:text-secondary">
          Each row takes ~3–5 seconds. The job runs in the background; rows update in real time as
          the worker finishes each one. You can keep editing other parts of the standard while it
          runs.
        </p>
        <p class="tw:text-xs tw:text-secondary">
          Normative text from copyrighted standards is never reproduced — guidance is the model's
          own original prose.
        </p>
      </div>
      <template #footer>
        <BaseButton variant="outline" @click="showBulkConfirm = false">Cancel</BaseButton>
        <BaseButton variant="primary" :loading="bulkEnriching" @click="handleBulkEnrich">
          <template #icon><IconSparkles :size="16" /></template>
          Enrich {{ emptyRowCount }} row{{ emptyRowCount === 1 ? '' : 's' }}
        </BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
