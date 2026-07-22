<script setup>
/**
 * Submit an Inspection Lot for QA Disposition. The disposition workflow is fixed
 * when the lot is created (it comes from the lot's inspection plan, or the
 * company default) — so there's normally no workflow to pick here; the picker
 * only appears as an escape hatch when neither resolves. The reviewer is chosen
 * with the standard role-aware WorkflowStepReviewerSelect, defaulting to the
 * submitter when they hold the step's role, else their department supervisor.
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({ lotId: { type: String, required: true } })
const emit = defineEmits(['submitted'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)

const QC_MODULE = { displayName: 'lot', workflowVersionModuleId: 'QC_INSPECTION' }
const currentUserId = computed(() => currentSession.value?.userId || null)

// Single reviewer for the first approval step — the backend maps reviewerIds to
// the first APPROVAL step of the resolved workflow.
const reviewerId = ref(null)
// Escape-hatch workflow override — only used when nothing auto-resolves.
const workflowVersionId = ref(null)

const lot = useLiveQueryWithDeps([() => props.lotId], async (db, [id]) =>
  id ? db.InspectionLot.findByPk(id) : null,
)
const planTemplate = useLiveQueryWithDeps([() => lot.value?.templateId], async (db, [tid]) =>
  tid ? db.QcInspectionTemplate.findByPk(tid) : null,
)
const planWorkflowVersionId = computed(() => planTemplate.value?.workflowVersionId ?? null)

// Company-default QC disposition workflow (active QC workflow flagged default, else first).
const qcWorkflows = useLiveQuery((db) => db.Workflow.where('moduleId', 'QC_INSPECTION').exec(), {
  models: ['Workflow'],
  initial: [],
})
const qcVersions = useLiveQuery((db) => db.WorkflowVersion.where().exec(), {
  models: ['WorkflowVersion'],
  initial: [],
})
const workflowResolution = computed(() => {
  const active = (qcWorkflows.value || []).filter((w) => w.statusId === 'ACTIVE')
  const currentByWorkflow = new Map()
  for (const v of qcVersions.value || []) {
    if (!active.some((w) => w.id === v.workflowId)) continue
    const cur = currentByWorkflow.get(v.workflowId)
    if (!cur || v.isCurrent || (!cur.isCurrent && v.versionMajor > cur.versionMajor)) {
      currentByWorkflow.set(v.workflowId, v)
    }
  }
  const options = active
    .map((w) => {
      const v = currentByWorkflow.get(w.id)
      return v
        ? { id: v.id, name: `${w.name} (v${v.versionMajor}.${v.versionMinor})`, isDefault: !!w.isDefault }
        : null
    })
    .filter(Boolean)
  const fallback = options.find((o) => o.isDefault) || options[0] || null
  return { options, defaultVersionId: fallback?.id || null }
})
const workflowOptions = computed(() => workflowResolution.value.options)

// A workflow auto-resolves (no picker needed) when the plan provides one OR a
// company default exists — the picker only shows as an escape hatch otherwise.
const autoResolves = computed(
  () => !!planWorkflowVersionId.value || !!workflowResolution.value.defaultVersionId,
)
const resolvedVersionId = computed(
  () =>
    planWorkflowVersionId.value ||
    workflowVersionId.value ||
    workflowResolution.value.defaultVersionId ||
    null,
)

// First APPROVAL step of the resolved workflow — the reviewer target.
const firstApprovalStep = useLiveQueryWithDeps(
  [() => resolvedVersionId.value],
  async (db, [vid]) => {
    if (!vid) return null
    const steps = await db.WorkflowStep.where('workflowVersionId', vid).orderBy('stepOrder', 'asc').exec()
    return steps.find((s) => s.stepType === 'APPROVAL') || steps[0] || null
  },
  { models: ['WorkflowStep'] },
)

watch(show, (v) => {
  if (v) {
    reviewerId.value = null
    workflowVersionId.value = null
  }
})

const canSubmit = computed(() => !!reviewerId.value && !!resolvedVersionId.value && !saving.value)

async function onSubmit() {
  if (!canSubmit.value) return
  saving.value = true
  try {
    await post(`/v1/services/qcInspection/lots/${props.lotId}/submit`, {
      reviewerIds: reviewerId.value ? [reviewerId.value] : [],
      // Blank when the plan / default resolves it; only the escape-hatch override is sent.
      workflowVersionId: autoResolves.value ? null : workflowVersionId.value || null,
    })
    toast.success('Lot submitted for QA disposition')
    show.value = false
    emit('submitted')
  } catch (err) {
    toast.error(err?.message || 'Submission failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Submit for QA Disposition" :persistent="true">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <div class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:p-3 tw:text-sm tw:text-amber-800">
        <p class="tw:font-medium">QA disposition creates a formal approval record.</p>
        <p class="tw:text-xs tw:mt-1">
          The selected reviewer will receive a task. On <strong>Approval</strong> the lot is
          released. On <strong>Rejection</strong> a Nonconformance is automatically raised.
        </p>
      </div>

      <!-- Escape hatch only: a lot's workflow comes from its inspection plan / the
           company default. Shown only when neither resolves. -->
      <BaseField
        v-if="!autoResolves"
        label="Disposition Workflow"
        required
        hint="This lot's inspection plan has no workflow and there's no company default — pick one."
      >
        <BaseSelect
          v-model="workflowVersionId"
          :options="workflowOptions"
          optionLabel="name"
          optionValue="id"
          placeholder="Select a QC disposition workflow"
        />
        <p v-if="!workflowOptions.length" class="tw:mt-1 tw:text-xs tw:text-amber-700">
          No QC disposition workflow exists yet. Create one under Workflows, or run db:reset to seed
          the default.
        </p>
      </BaseField>

      <!-- Reviewer for the first approval step — role-filtered + smart default. -->
      <div v-if="resolvedVersionId && firstApprovalStep">
        <p class="tw:text-sm tw:font-medium tw:text-on-main tw:mb-1.5">QA Reviewer</p>
        <WorkflowStepReviewerSelect
          :key="resolvedVersionId"
          v-model="reviewerId"
          :module="QC_MODULE"
          :step="firstApprovalStep"
          :stepIndex="0"
          :required="true"
          :preferUserId="currentUserId"
        />
        <p class="tw:mt-1 tw:text-xs tw:text-secondary">
          Defaults to you when you hold the reviewer role, otherwise your supervisor.
        </p>
      </div>
      <p v-else-if="!autoResolves" class="tw:text-xs tw:text-secondary">
        Pick a workflow above to choose the reviewer.
      </p>
    </div>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Submit for Disposition"
        :loading="saving"
        :disabled="!canSubmit"
        @cancel="show = false"
        @submit="onSubmit"
      />
    </template>
  </BaseDialog>
</template>
