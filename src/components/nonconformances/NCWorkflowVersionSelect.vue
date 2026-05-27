<script setup>
const emit = defineEmits(['submit'])
const modelValue = defineModel({ type: String })
const submitDialogOpen = ref(false)

// Workflow steps for the selected version, ordered by stepOrder
const steps = useLiveQueryWithDeps(
  [() => modelValue.value],
  async (db, [versionId]) => {
    if (!versionId) return []
    return db.WorkflowStep.where('workflowVersionId', versionId).orderBy('stepOrder', 'asc').exec()
  },
  { initial: [] },
)

// Local state for reviewer selections: { [stepId]: userId }
const selections = reactive({})

// Whether the first step has a reviewer assigned (used to gate the Confirm button)
const firstStepHasUser = computed(() => {
  const firstStepId = steps.value[0]?.id
  return !!firstStepId && !!selections[firstStepId]
})

// Reset selections when dialog opens
watch(submitDialogOpen, (isOpen) => {
  if (isOpen) {
    Object.keys(selections).forEach((key) => delete selections[key])
  }
})

function submit() {
  if (!modelValue.value) return
  submitDialogOpen.value = true
}

function handleConfirm() {
  if (!firstStepHasUser.value) return

  // Build payload: { [stepId]: [userId] } — array-wrapped for future multi-select
  const reviewers = {}
  Object.entries(selections).forEach(([stepId, userId]) => {
    if (userId) {
      reviewers[stepId] = [userId]
    }
  })

  submitDialogOpen.value = false
  emit('submit', reviewers)
}

function handleCancel(close) {
  close()
}

defineExpose({ submit })
</script>

<template>
  <WorkflowVersionSelect v-model="modelValue" moduleId="NON_CONFORMANCE" />

  <BaseDialog v-model="submitDialogOpen" title="Assign Step Reviewers" maxWidth="lg" persistent>
    <div class="tw:space-y-3 tw:py-2">
      <p class="tw:text-sm tw:text-secondary">
        Assign task to user for each workflow step before submitting.
      </p>
      <NCWorkflowStepReviewerSelect
        v-for="(step, index) in steps"
        :key="step.id"
        v-model="selections[step.id]"
        :data-testid="`nc-reviewer-select-${index}`"
        :step="step"
        :stepIndex="index"
        :required="index === 0"
      />
    </div>

    <template #footer="{ close }">
      <div class="tw:flex tw:justify-end tw:gap-2">
        <BaseButton variant="outline" @click="handleCancel(close)">Cancel</BaseButton>
        <BaseButton
          variant="primary"
          data-testid="nc-reviewer-confirm"
          :disabled="!firstStepHasUser"
          @click="handleConfirm"
        >
          Confirm
        </BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
