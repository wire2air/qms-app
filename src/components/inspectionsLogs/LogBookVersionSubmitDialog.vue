<script setup>
import { post } from '@/api'
import WorkflowStepReviewerSelect from '@/components/workflow/WorkflowStepReviewerSelect.vue'
import { LOG_BOOK_VERSION_MODULE } from '@/components/workflow/workflowModule.js'

/**
 * Submit-a-log-book-version-for-approval dialog.
 *
 * Given the log book's attached workflow version, lists its steps and
 * lets the submitter pick a reviewer per step (via the generic
 * WorkflowStepReviewerSelect — derives candidates from each step's
 * roles, or all active users when role-less). POSTs to
 * /logBookVersions/:versionId/submit with the { [stepId]: [userId] }
 * reviewers map. The backend hands the version to the workflow engine
 * and flips it to UNDER_REVIEW.
 */
const props = defineProps({
  versionId: { type: String, required: true },
  workflowVersionId: { type: String, default: null },
})
const emit = defineEmits(['submitted'])
const open = defineModel({ type: Boolean, default: false })

const toast = useToast()
const submitting = ref(false)
const changeSummary = ref('')
// { [stepId]: userId } — single reviewer per step for now (array-wrapped on submit).
const selections = reactive({})

const steps = useLiveQueryWithDeps(
  [() => props.workflowVersionId],
  async (db, [versionId]) => {
    if (!versionId) return []
    return db.WorkflowStep.where('workflowVersionId', versionId).orderBy('stepOrder', 'asc').exec()
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
    changeSummary.value = ''
  }
})

async function handleConfirm() {
  if (!firstStepHasUser.value || submitting.value) return
  const reviewers = {}
  Object.entries(selections).forEach(([stepId, userId]) => {
    if (userId) reviewers[stepId] = [userId]
  })
  submitting.value = true
  try {
    await post(`/v1/services/logBookVersions/${props.versionId}/submit`, {
      changeSummary: changeSummary.value?.trim() || null,
      reviewers,
    })
    toast.success('Submitted for approval')
    open.value = false
    emit('submitted')
  } catch (err) {
    toast.error(err?.message || 'Failed to submit for approval')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Submit for Approval" maxWidth="lg" persistent>
    <div class="tw:space-y-3 tw:py-2">
      <div v-if="!workflowVersionId" class="tw:text-sm tw:text-red-500">
        No approval workflow is attached to this log book. Attach one on the Details tab first.
      </div>
      <template v-else>
        <p class="tw:text-sm tw:text-secondary">
          Assign a reviewer for each workflow step before submitting.
        </p>
        <WorkflowStepReviewerSelect
          v-for="(step, index) in steps"
          :key="step.id"
          v-model="selections[step.id]"
          :module="LOG_BOOK_VERSION_MODULE"
          :step="step"
          :stepIndex="index"
          :required="index === 0"
        />
        <div>
          <p class="tw:text-secondary tw:text-sm tw:mb-1">Change summary (optional)</p>
          <BaseTextarea
            v-model="changeSummary"
            placeholder="What changed in this version?"
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
          {{ submitting ? 'Submitting…' : 'Submit' }}
        </BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
