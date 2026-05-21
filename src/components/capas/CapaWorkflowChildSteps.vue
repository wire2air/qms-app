<script setup>
import { IconPlus } from '@tabler/icons-vue'

const props = defineProps({
  parentInstanceStepId: { type: String, required: true },
  parentStepNumber: { type: [Number, String], default: null },
  workflowInstanceId: { type: String, required: true },
  capaId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
  allowChildSteps: { type: Boolean, default: false },
})

const emit = defineEmits(['reassign'])

// All children (template-spawned or ad-hoc) point at this parent via
// parentInstanceStepId. One indexed lookup, no template fetch needed.
const childInstanceSteps = useLiveQueryWithDeps(
  [() => props.parentInstanceStepId],
  async (db, [parentInstanceStepId]) => {
    if (!parentInstanceStepId) return []
    const all = await db.WorkflowInstanceStep.where(
      'parentInstanceStepId',
      parentInstanceStepId,
    ).exec()
    return all.sort((a, b) => a.stepOrder - b.stepOrder)
  },
  { initial: [] },
)

// Hide Add Tasks once the parent step is terminal — by the time the
// owner has approved/cancelled the stage there's no work left to fan
// out, and exposing the button would let new tasks get spawned that
// the workflow can never complete.
const parentInstanceStep = useLiveQueryWithDeps(
  [() => props.parentInstanceStepId],
  async (db, [id]) => (id ? db.WorkflowInstanceStep.findByPk(id) : null),
)
const PARENT_TERMINAL_STATUSES = ['APPROVED', 'REJECTED', 'CANCELLED', 'SKIPPED']
const isParentTerminal = computed(() =>
  PARENT_TERMINAL_STATUSES.includes(parentInstanceStep.value?.statusId),
)
const canAddChild = computed(
  () => props.isOwner && props.allowChildSteps && !isParentTerminal.value,
)

function childDisplayNumber(child) {
  const ordinal = childInstanceSteps.value.findIndex((c) => c.id === child.id) + 1
  if (!ordinal) return ''
  return props.parentStepNumber != null ? `${props.parentStepNumber}.${ordinal}` : `${ordinal}`
}

// ─── Add child step dialog ───────────────────────────────────────────────────
const addDialogOpen = ref(false)
function openAddDialog() {
  addDialogOpen.value = true
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <div v-if="canAddChild" class="tw:flex tw:justify-end">
      <BaseButton variant="outline" size="sm" @click="openAddDialog">
        <template #icon><IconPlus :size="14" /></template>
        Add Tasks
      </BaseButton>
    </div>

    <CapaWorkflowChildStep
      v-for="child in childInstanceSteps"
      :key="child.id"
      :instanceStepId="child.id"
      :capaId="capaId"
      :isOwner="isOwner"
      :displayNumber="childDisplayNumber(child)"
      @reassign="(id) => emit('reassign', id)"
    />

    <CapaAddChildStepDialog
      v-model="addDialogOpen"
      :capaId="capaId"
      :parentInstanceStepId="parentInstanceStepId"
    />
  </div>
</template>
