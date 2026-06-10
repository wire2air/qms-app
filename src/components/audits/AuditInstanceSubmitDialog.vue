<script setup>
/**
 * Submit-an-audit-for-close-out dialog.
 *
 * Mirrors LogBookVersionSubmitDialog + AuditStandardVersionSubmitDialog.
 * The audit doesn't pre-attach a workflow (unlike DocumentVersion /
 * LogBookVersion which inherit from the parent), so the dialog also
 * asks the user to pick a workflow version filtered to the
 * AUDIT_INSTANCE module. POSTs to /v1/services/auditInstances/:id/submit;
 * BE flips status to REVIEW and the engine takes over.
 */
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import WorkflowStepReviewerSelect from '@/components/workflow/WorkflowStepReviewerSelect.vue'
import { AUDIT_INSTANCE_MODULE } from '@/components/workflow/workflowModule.js'

const props = defineProps({
  auditInstanceId: { type: String, required: true },
})
const emit = defineEmits(['submitted'])
const open = defineModel({ type: Boolean, default: false })

const toast = useToast()
const submitting = ref(false)
const comments = ref('')
const workflowVersionId = ref(null)
// { [stepId]: userId } — single reviewer per step, array-wrapped on submit.
const selections = reactive({})

const steps = useLiveQueryWithDeps(
  [() => workflowVersionId.value],
  async (db, [versionId]) => {
    if (!versionId) return []
    return db.WorkflowStep.where('workflowVersionId', versionId)
      .orderBy('stepOrder', 'asc')
      .exec()
  },
  { initial: [] },
)

const firstStepHasUser = computed(() => {
  const firstStepId = steps.value[0]?.id
  return !!firstStepId && !!selections[firstStepId]
})

watch(open, (isOpen) => {
  if (isOpen) {
    Object.keys(selections).forEach((k) => delete selections[k])
    comments.value = ''
    workflowVersionId.value = null
  }
})

// When the user switches workflow, drop stale per-step picks.
watch(workflowVersionId, () => {
  Object.keys(selections).forEach((k) => delete selections[k])
})

async function handleConfirm() {
  if (!workflowVersionId.value || !firstStepHasUser.value || submitting.value) return
  const reviewers = {}
  Object.entries(selections).forEach(([stepId, userId]) => {
    if (userId) reviewers[stepId] = [userId]
  })
  submitting.value = true
  try {
    await post(`/v1/services/auditInstances/${props.auditInstanceId}/submit`, {
      workflowVersionId: workflowVersionId.value,
      reviewers,
      comments: comments.value?.trim() || null,
    })
    toast.success('Audit submitted for close-out')
    open.value = false
    emit('submitted')
  } catch (err) {
    toast.error(err?.message || 'Failed to submit audit')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Submit Audit for Close-Out" maxWidth="lg" persistent>
    <div class="tw:space-y-3 tw:py-2">
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
          Close-Out Workflow <span class="tw:text-red-500">*</span>
        </p>
        <WorkflowVersionSelect
          v-model="workflowVersionId"
          :moduleId="AUDIT_INSTANCE_MODULE.workflowVersionModuleId"
        />
        <p class="tw:text-[11px] tw:text-secondary tw:mt-1">
          Pick the workflow that drives close-out approval. Defaults seed
          a "Default Audit Close-Out" template (Lead Auditor review →
          Quality Manager sign-off).
        </p>
      </div>

      <template v-if="workflowVersionId">
        <p class="tw:text-sm tw:text-secondary">
          Assign a reviewer for each workflow step before submitting.
        </p>
        <WorkflowStepReviewerSelect
          v-for="(step, index) in steps"
          :key="step.id"
          v-model="selections[step.id]"
          :module="AUDIT_INSTANCE_MODULE"
          :step="step"
          :stepIndex="index"
          :required="index === 0"
        />
        <div>
          <p class="tw:text-secondary tw:text-sm tw:mb-1">Comments (optional)</p>
          <BaseTextarea
            v-model="comments"
            placeholder="Any context for reviewers?"
            :rows="2"
          />
        </div>
      </template>
    </div>

    <template #footer="{ close }">
      <div class="tw:flex tw:justify-end tw:gap-2">
        <BaseButton variant="outline" @click="close">Cancel</BaseButton>
        <BaseButton
          variant="primary"
          :disabled="!workflowVersionId || !firstStepHasUser || submitting"
          @click="handleConfirm"
        >
          {{ submitting ? 'Submitting…' : 'Submit for Close-Out' }}
        </BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
