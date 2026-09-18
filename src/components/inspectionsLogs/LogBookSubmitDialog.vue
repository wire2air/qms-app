<script setup>
import { post } from '@/api'
import WorkflowStepReviewerSelect from '@/components/workflow/WorkflowStepReviewerSelect.vue'
import { LOG_BOOK_APPROVAL_MODULE } from '@/components/workflow/workflowModule.js'

/**
 * Submit-a-log-book-for-approval dialog (supersede model — the BOOK is
 * the approved resource).
 *
 * Given the book's attached workflow version, lists its steps and lets
 * the submitter pick a reviewer per step (via the generic
 * WorkflowStepReviewerSelect). POSTs to /logBooks/:id/submit with the
 * { [stepId]: [userId] } reviewers map + required change summary. The
 * backend hands the book to the workflow engine and flips it to
 * UNDER_REVIEW.
 */
const props = defineProps({
  logBookId: { type: String, required: true },
  workflowVersionId: { type: String, default: null },
})
const emit = defineEmits(['submitted'])
const open = defineModel({ type: Boolean, default: false })

const toast = useToast()
const submitting = ref(false)
const changeSummary = ref('')
// { [stepId]: userId } — single reviewer per step for now (array-wrapped on submit).
const selections = reactive({})

const activeAssignments = useLiveQueryWithDeps(
  [() => props.logBookId],
  async (db, [id]) => (id ? (await db.FormAssignment.where('logBookId', id).exec()).filter((a) => a.active) : []),
  { models: ['FormAssignment'], initial: [] },
)

const steps = useLiveQueryWithDeps(
  [() => props.workflowVersionId],
  async (db, [versionId]) => {
    if (!versionId) return []
    return db.WorkflowStep.where('workflowVersionId', versionId).orderBy('stepOrder', 'asc').exec()
  },

  { models: ['WorkflowStep'], initial: [] },
)

// No segregation-of-duties constraints here (user decision 2026-08-07,
// reversing the 08-06 experiment): the submitter may review their own
// submission and one person may hold multiple steps. Eligibility is the
// step's ROLE membership + site visibility — nothing else.
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

const hasChangeSummary = computed(() => !!changeSummary.value?.trim())

async function handleConfirm() {
  if (!firstStepHasUser.value || !hasChangeSummary.value || submitting.value) return
  const reviewers = {}
  Object.entries(selections).forEach(([stepId, userId]) => {
    if (userId) reviewers[stepId] = [userId]
  })
  submitting.value = true
  try {
    await post(`/v1/services/logBooks/${props.logBookId}/submit`, {
      changeSummary: changeSummary.value.trim(),
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
        <div
          v-if="logBookId && activeAssignments.length === 0"
          class="tw:bg-amber-50 tw:text-amber-800 tw:border tw:border-amber-200 tw:rounded tw:p-2 tw:text-xs"
        >
          Heads up: no one is assigned to this log book yet — once approved, nobody can log
          entries until you add assignees on the <strong>Assignments</strong> tab. You can still
          submit now.
        </div>
        <WorkflowStepReviewerSelect
          v-for="(step, index) in steps"
          :key="step.id"
          v-model="selections[step.id]"
          :module="LOG_BOOK_APPROVAL_MODULE"
          :step="step"
          :stepIndex="index"
          :required="index === 0"
        />
        <BaseField v-slot="{ id: fieldId }" label="Change summary" required>
          <BaseTextarea
            :id="fieldId"
            v-model="changeSummary"
            placeholder="What changed in this version?"
            :rows="2"
          />
        </BaseField>
      </template>
    </div>

    <template #footer="{ close }">
      <BaseDialogFooter
        submitLabel="Submit"
        :loading="submitting"
        :disabled="!workflowVersionId || !firstStepHasUser || !hasChangeSummary"
        @cancel="close"
        @submit="handleConfirm"
      />
    </template>
  </BaseDialog>
</template>
