<script setup>
/**
 * List of child sub-tasks under a CR workflow stage that has
 * allowChildSteps=true (the seeded Implementation stage). The CR owner
 * can add ad-hoc sub-tasks here (DOC_UPDATE / TRAINING_ASSIGN /
 * SUPPLIER_NOTIFY / VALIDATION etc. — for v2 they're free-form, the
 * task-generation rules from prompt P2 are deferred).
 */
import { IconPlus } from '@tabler/icons-vue'

const props = defineProps({
  parentInstanceStepId: { type: String, required: true },
  parentStepNumber: { type: [Number, String], default: null },
  workflowInstanceId: { type: String, required: true },
  crId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
  allowChildSteps: { type: Boolean, default: false },
})

const emit = defineEmits(['reassign'])

const showAddDialog = ref(false)

const childSteps = useLiveQueryWithDeps(
  [() => props.parentInstanceStepId],
  async (db, [parentId]) => {
    if (!parentId) return []
    const rows = await db.WorkflowInstanceStep.where('parentInstanceStepId', parentId).exec()
    return rows.sort((a, b) => a.stepOrder - b.stepOrder)
  },

  { models: ['WorkflowInstanceStep'], initial: [] },
)

// Once the parent step is terminal (Mark Complete signed off,
// Cancelled, etc.) adding new sub-tasks is contradictory — the
// parent's bookkeeping says no more work is happening here. Gate the
// Add Sub-task button on the parent still being active.
const parentInstanceStep = useLiveQueryWithDeps(
  [() => props.parentInstanceStepId],

  async (db, [id]) => (id ? db.WorkflowInstanceStep.findByPk(id) : null),
  { models: ['WorkflowInstanceStep'] },
)
const PARENT_TERMINAL_STATUSES = ['APPROVED', 'REJECTED', 'CANCELLED', 'SKIPPED']
const isParentTerminal = computed(() =>
  PARENT_TERMINAL_STATUSES.includes(parentInstanceStep.value?.statusId),
)
const canAddSubTask = computed(
  () => props.allowChildSteps && props.isOwner && !isParentTerminal.value,
)

function openAdd() {
  if (!canAddSubTask.value) return
  showAddDialog.value = true
}
</script>

<template>
  <div class="tw:mt-4 tw:flex tw:flex-col tw:gap-2">
    <div class="tw:flex tw:items-center tw:justify-between tw:mb-1">
      <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">
        Sub-tasks
        <span
          v-if="childSteps.length"
          class="tw:text-[10px] tw:bg-gray-100 tw:text-gray-700 tw:px-1.5 tw:py-0.5 tw:rounded tw:ml-1"
        >
          {{ childSteps.length }}
        </span>
      </div>
      <BaseButton v-if="canAddSubTask" variant="outline" size="sm" @click="openAdd">
        <template #icon><IconPlus :size="14" /></template>
        Add Sub-task
      </BaseButton>
    </div>

    <div v-if="!childSteps.length" class="tw:text-xs tw:text-secondary tw:italic">
      No sub-tasks yet. Click "Add Sub-task" to add one (document update, training assignment,
      supplier notification, validation, etc.).
    </div>

    <ChangeRequestWorkflowChildStep
      v-for="(child, idx) in childSteps"
      :key="child.id"
      :instanceStepId="child.id"
      :crId="crId"
      :isOwner="isOwner"
      :displayNumber="`${parentStepNumber}.${idx + 1}`"
      @reassign="(id) => emit('reassign', id)"
    />

    <ChangeRequestAddChildStepDialog
      v-model="showAddDialog"
      :crId="crId"
      :parentInstanceStepId="parentInstanceStepId"
    />
  </div>
</template>
