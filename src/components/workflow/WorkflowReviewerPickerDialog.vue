<script setup>
/**
 * Generic workflow-version select + reviewer-per-step dialog used at
 * submit time by NC + CAPA create flows. Replaces NCWorkflowVersionSelect
 * + CAPAWorkflowVersionSelect.
 *
 * The version-select dropdown lives inline (parent passes v-model on
 * the chosen version id); clicking Submit on the parent form calls the
 * exposed submit() method, which opens the per-step reviewer dialog.
 * Confirm emits the picks as `{ [stepId]: [userId] }` so the create
 * controller can park them in pendingReviewers and start the workflow.
 *
 * Module-specific behaviour is parameterised:
 *   - workflowVersionModuleId scopes the version dropdown to this
 *     module's templates.
 *   - displayName / supplier-facing routing flow through to
 *     WorkflowStepReviewerSelect.
 *
 * Child-step rendering (parent → children indented beneath) is always
 * on; modules whose templates don't define children just see a flat
 * root list.
 */
import WorkflowStepReviewerSelect from '@/components/workflow/WorkflowStepReviewerSelect.vue'

const props = defineProps({
  module: { type: Object, required: true },
  isSupplierFacing: { type: Boolean, default: false },
  supplierId: { type: String, default: null },
  ownerId: { type: String, default: null },
})
const emit = defineEmits(['submit'])
const modelValue = defineModel({ type: String })
const submitDialogOpen = ref(false)

const steps = useLiveQueryWithDeps(
  [() => modelValue.value],
  async (db, [versionId]) => {
    if (!versionId) return []
    return db.WorkflowStep.where('workflowVersionId', versionId).orderBy('stepOrder', 'asc').exec()
  },

  { models: ['WorkflowStep'], initial: [] },
)

// Flatten as root1, root1.child1, root1.child2, root2, … so children
// render directly beneath their parent and can be styled as such. Pure
// no-op for modules without child steps — `out` reduces to the roots.
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

const firstStepHasUser = computed(
  () => !!firstRootStepId.value && !!selections[firstRootStepId.value],
)

// Clear stale picks when the dialog opens — otherwise a previously
// cancelled submit attempt would pre-fill the next one.
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
  <WorkflowVersionSelect v-model="modelValue" :moduleId="module.workflowVersionModuleId" />

  <BaseDialog v-model="submitDialogOpen" title="Assign Step Reviewers" maxWidth="lg" persistent>
    <div class="tw:space-y-3 tw:py-2">
      <p class="tw:text-sm tw:text-secondary">
        Assign task to user for each workflow step before submitting.
      </p>
      <WorkflowStepReviewerSelect
        v-for="entry in orderedSteps"
        :key="entry.step.id"
        v-model="selections[entry.step.id]"
        :module="module"
        :step="entry.step"
        :stepIndex="entry.isChild ? entry.childIndex : entry.index"
        :parentIndex="entry.parentIndex"
        :isChild="entry.isChild"
        :required="!entry.isChild && entry.step.id === firstRootStepId"
        :isSupplierFacing="props.isSupplierFacing"
        :supplierId="props.supplierId"
        :ownerId="props.ownerId"
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
