<script setup>
/**
 * Renders a workflow instance's steps, collapsing consecutive runs assigned to
 * the current user into a single grouped card.
 *
 * The six per-module hosts (NC, CAPA, Complaint, Change Request, and the two
 * audit ones) used to `v-for` WorkflowStep directly. They now go through here
 * so the grouping decision lives in one place rather than six.
 *
 * ── The off switch ───────────────────────────────────────────────────────────
 * With STEP_GROUPING_ENABLED false, buildStepGroups returns an empty map, every
 * step falls through to the same WorkflowStep card with the same props, and the
 * group endpoint is never called. Identical to the behaviour before grouping
 * existed — that is the whole point of routing through a wrapper instead of
 * editing WorkflowStep.
 *
 * ── Ungroup ──────────────────────────────────────────────────────────────────
 * Purely local: the head step id goes into `ungrouped`, the group stops
 * rendering, and its steps reappear as individual cards on the ordinary path.
 * Nothing is persisted, so there is nothing to undo and no way for it to
 * disagree with the server.
 *
 * ── Sub-tasks ────────────────────────────────────────────────────────────────
 * A step with OPEN sub-tasks never joins a run (completing the parent would
 * skip work still outstanding). A step that merely ALLOWS them can be grouped,
 * and while grouped its #childSteps slot is not rendered, so no new sub-task
 * can be added to it — Ungroup restores that. Worth knowing before widening the
 * grouping rules.
 */
import WorkflowStep from '@/components/workflow/WorkflowStep.vue'
import WorkflowStepGroup from '@/components/workflow/WorkflowStepGroup.vue'
import { currentSession } from '@/utils/currentSession'
import { buildStepGroups, collapsedStepIds } from '@/composables/useWorkflowStepGrouping.js'

const props = defineProps({
  /** Instance steps, already de-duplicated and ordered by the host. */
  steps: { type: Array, required: true },
  module: { type: Object, required: true },
  resourceId: { type: String, required: true },
  isOwner: { type: Boolean, default: false },
})

const emit = defineEmits(['reassign'])

// Mirrors WorkflowStep: a task is actionable in these states.
const ACTIONABLE_STATUSES = ['ASSIGNED', 'FORM_SUBMITTED', 'PENDING']

const currentUserId = computed(() => currentSession.value?.userId ?? currentSession.value?.id)

/** Head step ids the user chose to split back apart, for this mount. */
const ungrouped = ref(new Set())

const stepIdKey = computed(() => props.steps.map((s) => s.id).join(','))

// Assignees per step — grouping needs "exactly one assignee, and it's me".
const assigneesByStep = useLiveQueryWithDeps(
  [() => stepIdKey.value],
  async (db, [key]) => {
    if (!key) return {}
    const out = {}
    for (const id of key.split(',')) {
      const rows = await db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
      out[id] = [...new Set(rows.map((r) => r.userId).filter(Boolean))]
    }
    return out
  },
  { models: ['UserOnWorkflowInstanceStep'], initial: {} },
)

// Open sub-tasks block a step from joining a run — completing the parent would
// otherwise skip past work that is still outstanding.
const OPEN_CHILD_STATUSES = ['PENDING', 'IN_PROGRESS', 'SENT_BACK', 'CHANGES_REQUESTED']
const openChildrenByStep = useLiveQueryWithDeps(
  [() => stepIdKey.value],
  async (db, [key]) => {
    if (!key) return {}
    const out = {}
    for (const id of key.split(',')) {
      const kids = await db.WorkflowInstanceStep.where('parentInstanceStepId', id).exec()
      out[id] = kids.filter((k) => OPEN_CHILD_STATUSES.includes(k.statusId)).length
    }
    return out
  },
  { models: ['WorkflowInstanceStep'], initial: {} },
)

// The current user's actionable task on each step — a run can only be headed by
// a step the user can actually act on.
const myTaskByStep = useLiveQueryWithDeps(
  [() => stepIdKey.value, () => currentUserId.value],
  async (db, [key, userId]) => {
    if (!key || !userId) return {}
    const out = {}
    for (const id of key.split(',')) {
      const tasks = await db.TaskInstance.where('[sourceType+sourceId]', [
        'WorkflowInstanceStep',
        id,
      ]).exec()
      const mine = tasks.find(
        (t) =>
          t.assignedTo === userId &&
          t.taskKindId === 'APPROVAL' &&
          ACTIONABLE_STATUSES.includes(t.statusId),
      )
      if (mine) out[id] = mine.id
    }
    return out
  },
  { models: ['TaskInstance'], initial: {} },
)

const groups = computed(() => {
  const all = buildStepGroups(props.steps, {
    userId: currentUserId.value,
    assigneesFor: (id) => assigneesByStep.value[id] ?? [],
    openChildrenFor: (id) => openChildrenByStep.value[id] ?? 0,
  })
  // Drop runs the user split apart, and any whose head has no actionable task
  // for them (the Complete button would have nothing to post against).
  for (const headId of [...all.keys()]) {
    if (ungrouped.value.has(headId) || !myTaskByStep.value[headId]) all.delete(headId)
  }
  return all
})

const collapsed = computed(() => collapsedStepIds(groups.value))

function onUngroup(headId) {
  ungrouped.value = new Set([...ungrouped.value, headId])
}
</script>

<template>
  <template v-for="(step, idx) in steps" :key="step.id">
    <!-- Head of a run: one card for the whole run. -->
    <WorkflowStepGroup
      v-if="groups.has(step.id)"
      :steps="groups.get(step.id)"
      :module="module"
      :resourceId="resourceId"
      :headTaskId="myTaskByStep[step.id]"
      canAct
      @ungroup="onUngroup(step.id)"
    />

    <!-- Swallowed by the run above; its card is inside the group. -->
    <template v-else-if="collapsed.has(step.id)" />

    <!-- Everything else: unchanged from before grouping existed. -->
    <WorkflowStep
      v-else
      :module="module"
      :instanceStepId="step.id"
      :resourceId="resourceId"
      :isOwner="isOwner"
      :displayNumber="String(idx + 1)"
      @reassign="(id) => emit('reassign', id)"
    >
      <!-- CAPA and Change Request render nested sub-tasks through this scoped
           slot. Forwarded verbatim so an ungrouped step is byte-identical to
           what these hosts rendered before the wrapper existed. -->
      <template v-if="$slots.childSteps" #childSteps="slotProps">
        <slot name="childSteps" v-bind="slotProps" />
      </template>
    </WorkflowStep>
  </template>
</template>
