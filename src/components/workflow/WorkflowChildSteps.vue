<script setup>
/**
 * Sub-tasks under a workflow step whose template sets allowChildSteps.
 *
 * Module-agnostic: it takes the same `module` descriptor every other workflow
 * component takes, so it serves NC, CAPA, Change Control, both complaint
 * modules and any promoted module (whose descriptor formModuleFor() builds
 * with the tenant's module key as resourceType).
 *
 * Was ChangeRequestWorkflowChildSteps. CAPA had a near-identical twin, and no
 * other module had one at all — which is why sub-tasks appeared to be a CAPA /
 * Change Control feature when the engine underneath has always been generic.
 *
 * The per-child rendering goes through the #child slot so a module with a
 * richer card of its own (CAPA) can supply it without forking this list.
 */
import { IconPlus } from '@tabler/icons-vue'

const props = defineProps({
  parentInstanceStepId: { type: String, required: true },
  parentStepNumber: { type: [Number, String], default: null },
  workflowInstanceId: { type: String, required: true },
  /** The module descriptor — carries resourceType, which the API path needs. */
  module: { type: Object, required: true },
  resourceId: { type: String, required: true },
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
// `isOwner` here is the host's "may this person drive the record" flag, which
// each detail page already derives from the permission matrix (recordScope.js).
// It matches what the server enforces on the endpoint — the module's `update`
// verb — so the button is not offered where the POST would be refused.
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
      <BaseText variant="overline">
        Sub-tasks
        <span
          v-if="childSteps.length"
          class="tw:text-micro tw:bg-gray-100 tw:text-gray-700 tw:px-1.5 tw:py-0.5 tw:rounded tw:ml-1"
        >
          {{ childSteps.length }}
        </span>
      </BaseText>
      <BaseButton v-if="canAddSubTask" variant="outline" size="sm" @click="openAdd">
        <template #icon><IconPlus :size="14" /></template>
        Add Sub-task
      </BaseButton>
    </div>

    <div v-if="!childSteps.length" class="tw:text-xs tw:text-secondary tw:italic">
      No sub-tasks yet.
    </div>

    <template v-for="(child, idx) in childSteps" :key="child.id">
      <slot
        name="child"
        :instanceStepId="child.id"
        :displayNumber="`${parentStepNumber}.${idx + 1}`"
      >
        <WorkflowChildStep
          :instanceStepId="child.id"
          :module="module"
          :resourceId="resourceId"
          :isOwner="isOwner"
          :displayNumber="`${parentStepNumber}.${idx + 1}`"
          @reassign="(id) => emit('reassign', id)"
        />
      </slot>
    </template>

    <WorkflowAddChildStepDialog
      v-model="showAddDialog"
      :module="module"
      :resourceId="resourceId"
      :parentInstanceStepId="parentInstanceStepId"
    />
  </div>
</template>
