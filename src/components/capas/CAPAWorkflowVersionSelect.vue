<script setup>
const emit = defineEmits(['submit'])
const modelValue = defineModel({ type: String })
const submitDialogOpen = ref(false)

const steps = useLiveQueryWithDeps(
  [() => modelValue.value],
  async (db, [versionId]) => {
    if (!versionId) return []
    return db.WorkflowStep.where('workflowVersionId', versionId).orderBy('stepOrder', 'asc').exec()
  },
  { initial: [] },
)

// Build a flat list ordered as: root1, root1.child1, root1.child2, root2, ...
// so children render directly beneath their parent and can be styled as such.
const orderedSteps = computed(() => {
  const all = steps.value || []
  const roots = all
    .filter((s) => !s.parentStepId)
    .slice()
    .sort((a, b) => a.stepOrder - b.stepOrder)
  const out = []
  roots.forEach((root, rootIdx) => {
    out.push({ step: root, isChild: false, index: rootIdx, parentIndex: null, childIndex: null })
    const children = all
      .filter((s) => s.parentStepId === root.id)
      .sort((a, b) => a.stepOrder - b.stepOrder)
    children.forEach((child, childIdx) => {
      out.push({
        step: child,
        isChild: true,
        index: -1,
        parentIndex: rootIdx,
        childIndex: childIdx,
      })
    })
  })
  return out
})

const selections = reactive({})

const firstRootStepId = computed(() => orderedSteps.value.find((e) => !e.isChild)?.step.id ?? null)

const firstStepHasUser = computed(() => {
  return !!firstRootStepId.value && !!selections[firstRootStepId.value]
})

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
  <WorkflowVersionSelect v-model="modelValue" moduleId="CAPA" />

  <BaseDialog v-model="submitDialogOpen" title="Assign Step Reviewers" maxWidth="lg" persistent>
    <div class="tw:space-y-3 tw:py-2">
      <p class="tw:text-sm tw:text-secondary">
        Assign task to user for each workflow step before submitting.
      </p>
      <CAPAWorkflowStepReviewerSelect
        v-for="entry in orderedSteps"
        :key="entry.step.id"
        v-model="selections[entry.step.id]"
        :step="entry.step"
        :stepIndex="entry.isChild ? entry.childIndex : entry.index"
        :parentIndex="entry.parentIndex"
        :isChild="entry.isChild"
        :required="!entry.isChild && entry.step.id === firstRootStepId"
      />
    </div>

    <template #footer="{ close }">
      <div class="tw:flex tw:justify-end tw:gap-2">
        <BaseButton variant="outline" @click="handleCancel(close)">Cancel</BaseButton>
        <BaseButton variant="primary" :disabled="!firstStepHasUser" @click="handleConfirm">
          Confirm
        </BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
