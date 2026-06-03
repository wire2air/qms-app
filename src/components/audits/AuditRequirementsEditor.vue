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
import { IconPlus, IconPencil, IconTrash, IconClipboardCheck, IconSparkles } from '@tabler/icons-vue'
import { post, patch, del } from '@/api'
import { canUseAi } from '@/utils/currentSession.js'

const props = defineProps({
  version: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
})

const toast = useToast()

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
  { initial: [] },
)

// ─── Dialog ────────────────────────────────────────────────────────────
const showEditDialog = ref(false)
const editing = ref(null)
const form = ref({
  clauseNumber: '',
  title: '',
  description: '',
  guidance: '',
  expectedEvidence: '',
  riskWeight: 1,
  displayOrder: 1000,
})
const saving = ref(false)

function openAdd() {
  if (props.readonly) return
  editing.value = null
  form.value = {
    clauseNumber: '',
    title: '',
    description: '',
    guidance: '',
    expectedEvidence: '',
    riskWeight: 1,
    displayOrder: (requirements.value?.length ?? 0) * 100 + 100,
  }
  showEditDialog.value = true
}

function openEdit(row) {
  if (props.readonly) return
  editing.value = row
  form.value = {
    clauseNumber: row.clauseNumber,
    title: row.title,
    description: row.description ?? '',
    guidance: row.guidance ?? '',
    expectedEvidence: row.expectedEvidence ?? '',
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
    const body = {
      clauseNumber: form.value.clauseNumber.trim(),
      title: form.value.title.trim(),
      description: form.value.description?.trim() || null,
      guidance: form.value.guidance?.trim() || null,
      expectedEvidence: form.value.expectedEvidence?.trim() || null,
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
    !window.confirm(
      `Delete clause ${row.clauseNumber} — "${row.title}"? This can be undone via the audit log within the same version.`,
    )
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

const emptyRowCount = computed(() =>
  requirements.value.filter((r) => !r.guidance || !r.expectedEvidence).length,
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
    const res = await post(
      `/v1/services/ai/auditStandardVersions/${props.version.id}/bulkEnrich`,
      { onlyEmpty: true },
    )
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
        class="tw:border tw:border-divider tw:rounded-md tw:bg-main-hover/30"
      >
        <div
          class="tw:flex tw:items-start tw:gap-3 tw:px-3 tw:py-2.5 tw:cursor-pointer tw:hover:bg-main-hover/60"
          @click="toggleExpanded(row.id)"
        >
          <code
            class="tw:text-xs tw:font-mono tw:bg-white tw:text-on-main tw:rounded tw:px-2 tw:py-0.5 tw:font-semibold tw:shrink-0"
          >
            {{ row.clauseNumber }}
          </code>
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:text-sm tw:font-medium tw:text-on-main">{{ row.title }}</div>
            <div
              v-if="row.description && !expandedIds.has(row.id)"
              class="tw:text-xs tw:text-secondary tw:truncate"
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
              <IconSparkles
                :size="16"
                :class="enrichingRowId === row.id ? 'tw:animate-pulse tw:text-purple-600' : ''"
              />
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
        </div>

        <!-- Expanded body -->
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
          <div v-if="row.expectedEvidence">
            <div class="tw:text-[10px] tw:font-bold tw:uppercase tw:text-secondary tw:mb-1">
              Expected Evidence
            </div>
            <div class="tw:text-sm tw:text-on-main tw:whitespace-pre-line">
              {{ row.expectedEvidence }}
            </div>
          </div>
          <div class="tw:flex tw:items-center tw:gap-4 tw:text-xs tw:text-secondary tw:pt-2 tw:border-t tw:border-divider">
            <span>Order: <strong>{{ row.displayOrder }}</strong></span>
            <span>Risk Weight: <strong>{{ row.riskWeight }}</strong></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit dialog -->
    <BaseDialog
      v-model="showEditDialog"
      :title="editing ? 'Edit Requirement' : 'Add Requirement'"
      maxWidth="lg"
    >
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <div class="tw:grid tw:grid-cols-[150px_1fr] tw:gap-3">
          <div>
            <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
              Clause # <span class="tw:text-red-500">*</span>
            </p>
            <BaseTextInput v-model="form.clauseNumber" placeholder="7.2.1" />
          </div>
          <div>
            <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
              Title <span class="tw:text-red-500">*</span>
            </p>
            <BaseTextInput
              v-model="form.title"
              placeholder="Personnel competency assessment"
            />
          </div>
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Description
          </p>
          <BaseTextarea
            v-model="form.description"
            :rows="4"
            placeholder="What the requirement says verbatim. Pasted from the standard text."
          />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Guidance
          </p>
          <BaseTextarea
            v-model="form.guidance"
            :rows="3"
            placeholder="How to interpret / audit this requirement. Internal interpretation notes."
          />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Expected Evidence
          </p>
          <BaseTextarea
            v-model="form.expectedEvidence"
            :rows="3"
            placeholder="What evidence the auditor should look for. Bulleted list works well."
          />
        </div>
        <div class="tw:grid tw:grid-cols-2 tw:gap-3">
          <div>
            <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
              Display Order
            </p>
            <BaseTextInput v-model.number="form.displayOrder" type="number" :min="0" />
          </div>
          <div>
            <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
              Risk Weight
            </p>
            <BaseTextInput v-model.number="form.riskWeight" type="number" :min="1" :max="100" />
            <p class="tw:text-[11px] tw:text-secondary tw:mt-1">
              1–100. Reserved for risk-based auditing prioritisation.
            </p>
          </div>
        </div>
      </div>
      <template #footer="{ close }">
        <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
        <BaseButton
          variant="primary"
          :loading="saving"
          :disabled="saving"
          @click="handleSave"
        >
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
          row{{ emptyRowCount === 1 ? '' : 's' }} on this draft version
          that don't have them yet.
        </p>
        <p class="tw:text-xs tw:text-secondary">
          Each row takes ~3–5 seconds. The job runs in the background;
          rows update in real time as the worker finishes each one. You
          can keep editing other parts of the standard while it runs.
        </p>
        <p class="tw:text-xs tw:text-secondary">
          Normative text from copyrighted standards is never reproduced
          — guidance is the model's own original prose.
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
