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
import { pickActionableTask, mayActOnStepType } from '@/components/workflow/stepTakeover.js'
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

// Task statuses that mean "this task is no longer the assignment" — a
// reassigned or cancelled task must not count towards who owns the step.
const DEAD_TASK_STATUSES = ['REASSIGNED', 'CANCELLED']

/**
 * Who owns each step.
 *
 * The LIVE task wins where one exists. Reassignment moves the task but leaves
 * the old row in users_on_workflow_instance_steps, so a reassigned step reads
 * as two assignees there and stops grouping entirely (reported 2026-08-18).
 * The task is what WorkflowStep itself trusts, so grouping trusts it too.
 *
 * Steps that have not activated have no task, and there the planned reviewer
 * set is the only signal there is.
 */
const assigneesByStep = useLiveQueryWithDeps(
  [() => stepIdKey.value],
  async (db, [key]) => {
    if (!key) return {}
    const out = {}
    for (const id of key.split(',')) {
      const tasks = await db.TaskInstance.where('[sourceType+sourceId]', [
        'WorkflowInstanceStep',
        id,
      ]).exec()
      const live = tasks.filter((t) => t.assignedTo && !DEAD_TASK_STATUSES.includes(t.statusId))
      if (live.length) {
        out[id] = [...new Set(live.map((t) => t.assignedTo))]
        continue
      }
      const rows = await db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
      out[id] = [...new Set(rows.map((r) => r.userId).filter(Boolean))]
    }
    return out
  },
  { models: ['UserOnWorkflowInstanceStep', 'TaskInstance'], initial: {} },
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

// The record behind this workflow — needed to ask whether a non-assignee may
// act on its steps.
const resource = useLiveQueryWithDeps([() => props.resourceId], async (db, [id]) =>
  id ? db[props.module.resourceModel.modelName].findByPk(id) : null,
)

// Grouped runs are ACTION steps by definition (stepGroupIneligibleReason
// refuses anything else), so the verb is always the module's update.
const mayTakeOverRun = computed(() =>
  mayActOnStepType({ module: props.module, record: resource.value, stepType: 'ACTION' }),
)

// The actionable task on each step — the viewer's own, or the assignee's when
// the matrix lets them act on someone else's. A run can only be headed by a
// step the viewer can actually act on.
const actionableByStep = useLiveQueryWithDeps(
  [() => stepIdKey.value, () => currentUserId.value, () => mayTakeOverRun.value],
  async (db, [key, userId, mayTakeOver]) => {
    if (!key || !userId) return {}
    const out = {}
    for (const id of key.split(',')) {
      const tasks = await db.TaskInstance.where('[sourceType+sourceId]', [
        'WorkflowInstanceStep',
        id,
      ]).exec()
      const picked = pickActionableTask({
        tasks,
        userId,
        mayTakeOver,
        statuses: ACTIONABLE_STATUSES,
      })
      if (picked.task) out[id] = { id: picked.task.id, isTakeover: picked.isTakeover }
    }
    return out
  },
  { models: ['TaskInstance'], initial: {} },
)

const groups = computed(() => {
  const all = buildStepGroups(props.steps, {
    assigneesFor: (id) => assigneesByStep.value[id] ?? [],
    openChildrenFor: (id) => openChildrenByStep.value[id] ?? 0,
  })
  // A run is shown to everyone — it describes whose work it is. Only runs the
  // viewer split apart are dropped; whether they get a Complete button is
  // `canAct` below, from whether they hold an actionable task on the head.
  for (const headId of [...all.keys()]) {
    if (ungrouped.value.has(headId)) all.delete(headId)
  }
  return all
})

const collapsed = computed(() => collapsedStepIds(groups.value))

/** Owner display names, so a run that is not yours says whose it is. */
const ownerIdKey = computed(() =>
  [...groups.value.keys()]
    .map((h) => (assigneesByStep.value[h] ?? [])[0])
    .filter(Boolean)
    .join(','),
)
const ownerNames = useLiveQueryWithDeps(
  [() => ownerIdKey.value, () => currentUserId.value],
  async (db, [key, me]) => {
    if (!key) return {}
    const out = {}
    for (const id of [...new Set(key.split(','))]) {
      if (id === me) continue // blank reads as "you"
      const u = await db.User.findByPk(id)
      if (u) out[id] = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email
    }
    return out
  },
  { models: ['User'], initial: {} },
)

function ownerNameFor(headId) {
  return ownerNames.value[(assigneesByStep.value[headId] ?? [])[0]] ?? ''
}

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
      :headTaskId="actionableByStep[step.id]?.id ?? null"
      :canAct="!!actionableByStep[step.id]"
      :isTakeover="!!actionableByStep[step.id]?.isTakeover"
      :ownerName="ownerNameFor(step.id)"
      :isOwner="isOwner"
      @ungroup="onUngroup(step.id)"
      @reassign="(id) => emit('reassign', id)"
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
