<script setup>
/**
 * Generic QC "submit for approval" dialog — resolves a workflow (QC-specific OR
 * generic APPROVAL), picks a role-aware reviewer, and POSTs to `submitUrl`.
 * Used for controlled QC artifacts (specification, line-clearance checklist).
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { currentSession } from '@/utils/currentSession.js'

const props = defineProps({
  submitUrl: { type: String, required: true },
  title: { type: String, default: 'Submit for Approval' },
  intro: { type: String, default: 'The selected reviewer receives a task; on approval the item becomes effective.' },
})
const emit = defineEmits(['submitted'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)

const QC_MODULE = { displayName: 'item', workflowVersionModuleId: 'QC_INSPECTION' }
const currentUserId = computed(() => currentSession.value?.userId || null)
const reviewerId = ref(null)
const workflowVersionId = ref(null)

const APPROVAL_MODULES = ['QC_INSPECTION', 'APPROVAL']
const qcWorkflows = useLiveQuery(
  async (db) => (await db.Workflow.where().exec()).filter((w) => APPROVAL_MODULES.includes(w.moduleId)),
  { models: ['Workflow'], initial: [] },
)
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
      const tag = w.moduleId === 'APPROVAL' ? 'Generic' : 'QC'
      return v
        ? { id: v.id, name: `${w.name} (v${v.versionMajor}.${v.versionMinor}) · ${tag}`, isDefault: !!w.isDefault }
        : null
    })
    .filter(Boolean)
  const fallback = options.find((o) => o.isDefault) || options[0] || null
  return { options, defaultVersionId: fallback?.id || null }
})
const workflowOptions = computed(() => workflowResolution.value.options)
const autoResolves = computed(() => !!workflowResolution.value.defaultVersionId)
const resolvedVersionId = computed(() => workflowVersionId.value || workflowResolution.value.defaultVersionId || null)

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
    await post(props.submitUrl, {
      reviewerIds: reviewerId.value ? [reviewerId.value] : [],
      workflowVersionId: autoResolves.value ? null : workflowVersionId.value || null,
    })
    toast.success('Submitted for approval')
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
  <BaseDialog v-model="show" :title="title" :persistent="true">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <div class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:p-3 tw:text-sm tw:text-amber-800">
        {{ intro }}
      </div>

      <BaseField v-if="!autoResolves" label="Approval workflow" required hint="No default QC workflow is set — pick one.">
        <BaseSelect
          v-model="workflowVersionId"
          :options="workflowOptions"
          optionLabel="name"
          optionValue="id"
          placeholder="Select a workflow"
        />
        <p v-if="!workflowOptions.length" class="tw:mt-1 tw:text-xs tw:text-amber-700">
          No QC or generic Approval workflow exists yet. Create one under Workflows.
        </p>
      </BaseField>

      <div v-if="resolvedVersionId && firstApprovalStep">
        <p class="tw:text-sm tw:font-medium tw:text-on-main tw:mb-1.5">Reviewer</p>
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
      <p v-else-if="!autoResolves" class="tw:text-xs tw:text-secondary">Pick a workflow above to choose the reviewer.</p>
    </div>

    <template #footer>
      <BaseDialogFooter submitLabel="Submit for Approval" :loading="saving" :disabled="!canSubmit" @cancel="show = false" @submit="onSubmit" />
    </template>
  </BaseDialog>
</template>
