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
import { IconPlus, IconPencil, IconTrash, IconClipboardCheck } from '@tabler/icons-vue'
import { post, patch, del } from '@/api'

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
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <!-- Add affordance (editable only) -->
    <div v-if="!readonly" class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:text-xs tw:text-secondary">
        {{ requirements.length }} clause{{ requirements.length === 1 ? '' : 's' }}
      </div>
      <BaseButton variant="primary" size="sm" @click="openAdd">
        <template #icon><IconPlus :size="16" /></template>
        Add Requirement
      </BaseButton>
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
  </div>
</template>
