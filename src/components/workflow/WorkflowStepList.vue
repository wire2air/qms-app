<script setup>
import { IconPlus } from '@tabler/icons-vue'
import { currentCompany } from '@/utils/currentCompany.js'

const props = defineProps({
  versionId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
  showChildSteps: { type: Boolean, default: false },
  // workflow.moduleId — forwarded to the Add-Step wizard so it only offers the
  // step types this kind of workflow supports.
  moduleId: { type: String, default: null },
})

// Header-button intents bubble to the parent, which owns the two dialogs —
// one instance each, rather than a pair per step card.
const emit = defineEmits(['openSettings', 'openAssignees'])

const stepId = defineModel('stepId', {
  type: String,
  default: null,
})

const steps = useLiveQueryWithDeps(
  [() => props.versionId],
  async (db, [vId]) => {
    if (!vId) return []
    return db.WorkflowStep.where('workflowVersionId', vId).orderBy('stepOrder').exec()
  },

  { models: ['WorkflowStep'], initial: [] },
)

// Tree helpers (used when showChildSteps = true)
const rootSteps = computed(() =>
  steps.value.filter((s) => !s.parentStepId).sort((a, b) => a.stepOrder - b.stepOrder),
)

const childrenByParentId = computed(() =>
  steps.value.reduce((acc, s) => {
    if (s.parentStepId) {
      acc[s.parentStepId] ??= []
      acc[s.parentStepId].push(s)
    }
    return acc
  }, {}),
)

// Steps render EXPANDED by default (user request 2026-08-15) — the builder is
// a document you read top-to-bottom, not a set of drawers to open. Each card
// is its own toggle, so a step can be folded away individually; the parent
// renders the editor into the #stepEditor slot below the card.
//
// Collapsed ids (not expanded ids) are tracked so a newly added step is
// expanded automatically without having to watch for it.
const collapsedIds = ref(new Set())

function isExpanded(step) {
  return !collapsedIds.value.has(step.id)
}

function selectStep(step) {
  const next = new Set(collapsedIds.value)
  if (next.has(step.id)) next.delete(step.id)
  else next.add(step.id)
  collapsedIds.value = next
  // Keep the v-model in sync for hosts that track "the step being worked on".
  stepId.value = next.has(step.id) ? null : step.id
}

const createStep = useLiveMutation(
  async (db, { versionId, order, settings, parentStepId, name, stepType, formSchema, roleIds }) => {
    const s = settings || {}
    // formSchema starts empty unless the Add-Step wizard handed one over
    // (form block / preset pick). The old auto-seed from the "TASK"
    // FormTemplate was silently adding a form to every new step — including
    // APPROVAL steps that shouldn't have one at all. The Form tab on the
    // step editor still lets authors explicitly pick or build a schema.
    const step = db.WorkflowStep.create({
      workflowVersionId: versionId,
      name: name || `Step ${order}`,
      description: '',
      stepOrder: order,
      ...(stepType ? { stepType } : {}),
      approvalRule: s.defaultWorkflowApprovalRule ?? 'ALL',
      slaDays: s.defaultSla ?? null,
      requireComments: s.defaultWorkflowRequireComment ?? false,
      requireEsignature: s.defaultWorkflowRequireSignature ?? false,
      formSchema: formSchema ?? [],
      // Sub-steps stay allowed by default on wizard-created Task steps
      // (user decision 2026-08-12: no extra "allow sub-steps?" question —
      // the record owner can always add sub-tasks at runtime; authors can
      // still switch it off in the step editor's Compliance & options).
      // Only meaningful for modules that support child steps (CAPA / CC).
      ...(stepType === 'ACTION' && !parentStepId && props.showChildSteps
        ? { allowChildSteps: true }
        : {}),
      ...(parentStepId ? { parentStepId } : {}),
    })
    await step.save()

    // Seed all allowed outcomes for the new step
    const outcomes = await db.WorkflowStepOutcome.where().exec()
    for (const o of outcomes) {
      const record = db.AllowedOutcomeOnStep.create({ stepId: step.id, outcomeId: o.id })
      await record.save()
    }

    // Assignee roles picked in the wizard (templates are role-only).
    for (const roleId of roleIds ?? []) {
      const sr = db.WorkflowStepRole.create({ stepId: step.id, roleId })
      await sr.save()
    }

    return step
  },
)

function nextStepOrder() {
  const orders = steps.value.map((s) => s.stepOrder ?? 0)
  return (orders.length ? Math.max(...orders) : 0) + 1
}

// "Add Step" opens the guided wizard (type → task form → assignees) instead
// of instantly dropping a bare "Step N" into the editor (user request
// 2026-08-12). Sub-steps keep the instant path — they're small work items
// under an already-configured parent.
//
// Steps can be added at the END (Add Step button) or IN BETWEEN two steps
// (the + on the connector, redesign 2026-08-13): `insertBeforeOrder` carries
// the insertion point into the wizard's submit.
const showCreateDialog = ref(false)
const insertBeforeOrder = ref(null)

function addStep() {
  insertBeforeOrder.value = null
  showCreateDialog.value = true
}

function addStepBefore(step) {
  insertBeforeOrder.value = step?.stepOrder ?? null
  showCreateDialog.value = true
}

async function handleWizardSubmit({ stepType, name, formSchema, roleIds }) {
  const s = currentCompany.value?.settings || {}
  let order
  if (insertBeforeOrder.value != null) {
    // Insert between: the new step takes the target's order and everything
    // at/after it shifts down one slot. Descending so orders stay unique at
    // every intermediate save. Children share the global order pool, so
    // their relative order within each parent is preserved.
    order = insertBeforeOrder.value
    const toShift = steps.value
      .filter((x) => (x.stepOrder ?? 0) >= order)
      .sort((a, b) => (b.stepOrder ?? 0) - (a.stepOrder ?? 0))
    for (const x of toShift) {
      x.stepOrder = (x.stepOrder ?? 0) + 1
      await x.save()
    }
  } else {
    order = nextStepOrder()
  }
  insertBeforeOrder.value = null
  await createStep({
    versionId: props.versionId,
    order,
    settings: s,
    name,
    stepType,
    formSchema,
    roleIds,
  })
  // The new step renders EXPANDED like every other (collapsedIds starts
  // empty), so there is nothing to select — the wizard already collected
  // name/type/form/assignees.
}

// (No template-level "Add Sub-step" — removed 2026-08-14: sub-steps are a
// RUNTIME feature. `allowChildSteps` on a Task step lets the record owner
// fan out ad-hoc sub-tasks on the running record; templates author only the
// main flow. Existing child template steps still render for legacy data.)

// Generic helpers for scoped remove/swap
async function removeFromSiblings(step, siblings) {
  const index = siblings.findIndex((s) => s.id === step.id)
  if (index === -1) return
  const wasSelected = stepId.value === step.id
  await step.delete()
  // Deleting the OPEN step collapses the accordion — it used to fall back to
  // the previous sibling, which now reads as "delete opened a different step".
  if (wasSelected) stepId.value = null
}

async function swapInList(list, fromIndex, toIndex) {
  const a = list[fromIndex]
  const b = list[toIndex]
  if (!a || !b) return
  const tmpOrder = a.stepOrder
  a.stepOrder = b.stepOrder
  b.stepOrder = tmpOrder
  await Promise.all([a.save(), b.save()])
  // NOTE: no re-select here — expansion state is keyed by step id and
  // survives reordering on its own.
}

// Flat mode (showChildSteps = false)
async function removeStep(index) {
  await removeFromSiblings(steps.value[index], steps.value)
}

async function moveStepUp(index) {
  if (index > 0) await swapInList(steps.value, index, index - 1)
}

async function moveStepDown(index) {
  if (index < steps.value.length - 1) await swapInList(steps.value, index, index + 1)
}

// Nested mode — root step operations (showChildSteps = true)
async function removeRootStep(index) {
  await removeFromSiblings(rootSteps.value[index], rootSteps.value)
}

async function moveRootStepUp(index) {
  if (index > 0) await swapInList(rootSteps.value, index, index - 1)
}

async function moveRootStepDown(index) {
  if (index < rootSteps.value.length - 1) await swapInList(rootSteps.value, index, index + 1)
}

// Nested mode — child step operations
async function removeChildStep(parentId, index) {
  const siblings = childrenByParentId.value[parentId] ?? []
  await removeFromSiblings(siblings[index], siblings)
}

async function moveChildStepUp(parentId, index) {
  const siblings = childrenByParentId.value[parentId] ?? []
  if (index > 0) await swapInList(siblings, index, index - 1)
}

async function moveChildStepDown(parentId, index) {
  const siblings = childrenByParentId.value[parentId] ?? []
  if (index < siblings.length - 1) await swapInList(siblings, index, index + 1)
}

defineExpose({ addStep })
</script>

<template>
  <!-- Workflow canvas (redesign 2026-08-13): the steps ARE the page — a
       centered top-to-bottom flow with connectors, like a real workflow.
       Each step renders EXPANDED by default with its configuration inline
       below the card (#stepEditor slot, filled by the parent); clicking a
       card folds that step away. Steps can be inserted in between via the +
       on each connector, or appended with Add Step at the end. -->
  <div class="tw:w-full tw:max-w-3xl tw:mx-auto tw:p-4 tw:md:p-8">
    <!-- Header -->
    <div class="tw:pb-4 tw:flex tw:items-center tw:justify-between">
      <BaseText as="h2" variant="overline" color="inherit" class="tw:text-on-main">
        Workflow Sequence
      </BaseText>
      <span
        class="tw:text-xs tw:font-medium tw:text-secondary tw:bg-main-hover tw:px-2 tw:py-0.5 tw:rounded"
      >
        {{ steps?.length ?? 0 }} Step{{ (steps?.length ?? 0) !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- Nested mode -->
    <template v-if="showChildSteps">
      <template v-for="(step, index) in rootSteps" :key="step.id ?? index">
        <!-- Connector + insert point between this step and the previous one -->
        <div v-if="index > 0" class="tw:flex tw:flex-col tw:items-center">
          <div class="tw:w-px tw:h-3 tw:bg-divider"></div>
          <BaseTooltip v-if="canUpdate" content="Insert a step here">
            <button
              type="button"
              class="tw:flex tw:items-center tw:justify-center tw:w-6 tw:h-6 tw:rounded-full tw:border tw:border-divider tw:bg-main tw:text-secondary tw:hover:text-primary tw:hover:border-primary tw:hover:bg-primary/5 tw:transition-all"
              :aria-label="`Insert a step before ${step.name}`"
              @click="addStepBefore(step)"
            >
              <IconPlus :size="14" />
            </button>
          </BaseTooltip>
          <div class="tw:w-px tw:h-3 tw:bg-divider"></div>
        </div>

        <div class="tw:space-y-2">
          <WorkflowStepCard
            :step="step"
            :index="index"
            :isSelected="isExpanded(step)"
            :isFirst="index === 0"
            :isLast="index === rootSteps.length - 1"
            :canUpdate="canUpdate"
            @select="selectStep(step)"
            @remove="removeRootStep(index)"
            @moveUp="moveRootStepUp(index)"
            @moveDown="moveRootStepDown(index)"
            @openSettings="emit('openSettings', step.id)"
            @openAssignees="emit('openAssignees', step.id)"
          >
            <!-- Configuration lives INSIDE the card — one panel per step -->
            <template v-if="isExpanded(step)" #expanded>
              <slot name="stepEditor" :stepId="step.id" />
            </template>
          </WorkflowStepCard>

          <!-- Child steps — display/maintenance of existing template children
               only. No "Add Sub-step" here: sub-steps are added at RUNTIME by
               the record owner when the step allows them. -->
          <div v-if="(childrenByParentId[step.id] ?? []).length" class="tw:pl-6 tw:space-y-2">
            <template v-for="(child, ci) in childrenByParentId[step.id] ?? []" :key="child.id">
              <WorkflowStepCard
                :step="child"
                :index="ci"
                :isChild="true"
                :isSelected="isExpanded(child)"
                :isFirst="ci === 0"
                :isLast="ci === (childrenByParentId[step.id] ?? []).length - 1"
                :canUpdate="canUpdate"
                @select="selectStep(child)"
                @remove="removeChildStep(step.id, ci)"
                @moveUp="moveChildStepUp(step.id, ci)"
                @moveDown="moveChildStepDown(step.id, ci)"
                @openSettings="emit('openSettings', child.id)"
                @openAssignees="emit('openAssignees', child.id)"
              >
                <template v-if="isExpanded(child)" #expanded>
                  <slot name="stepEditor" :stepId="child.id" />
                </template>
              </WorkflowStepCard>
            </template>
          </div>
        </div>
      </template>
    </template>

    <!-- Flat mode -->
    <template v-else>
      <template v-for="(step, index) in steps" :key="step.id ?? index">
        <div v-if="index > 0" class="tw:flex tw:flex-col tw:items-center">
          <div class="tw:w-px tw:h-3 tw:bg-divider"></div>
          <BaseTooltip v-if="canUpdate" content="Insert a step here">
            <button
              type="button"
              class="tw:flex tw:items-center tw:justify-center tw:w-6 tw:h-6 tw:rounded-full tw:border tw:border-divider tw:bg-main tw:text-secondary tw:hover:text-primary tw:hover:border-primary tw:hover:bg-primary/5 tw:transition-all"
              :aria-label="`Insert a step before ${step.name}`"
              @click="addStepBefore(step)"
            >
              <IconPlus :size="14" />
            </button>
          </BaseTooltip>
          <div class="tw:w-px tw:h-3 tw:bg-divider"></div>
        </div>

        <WorkflowStepCard
          :step="step"
          :index="index"
          :isSelected="isExpanded(step)"
          :isFirst="index === 0"
          :isLast="index === steps.length - 1"
          :canUpdate="canUpdate"
          @select="selectStep(step)"
          @remove="removeStep(index)"
          @moveUp="moveStepUp(index)"
          @moveDown="moveStepDown(index)"
          @openSettings="emit('openSettings', step.id)"
          @openAssignees="emit('openAssignees', step.id)"
        >
          <!-- Configuration lives INSIDE the card — one panel per step -->
          <template v-if="isExpanded(step)" #expanded>
            <slot name="stepEditor" :stepId="step.id" />
          </template>
        </WorkflowStepCard>
      </template>
    </template>

    <!-- Connector into the Add Step button -->
    <div v-if="canUpdate && (steps?.length ?? 0) > 0" class="tw:flex tw:flex-col tw:items-center">
      <div class="tw:w-px tw:h-4 tw:bg-divider"></div>
    </div>

    <!-- Add Step Button — opens the guided wizard, appends at the end -->
    <button
      v-if="canUpdate"
      class="tw:w-full tw:py-4 tw:border-2 tw:border-dashed tw:border-divider tw:rounded-xl tw:flex tw:items-center tw:justify-center tw:gap-2 tw:text-secondary tw:hover:text-primary tw:hover:border-primary tw:hover:bg-primary/5 tw:transition-all"
      @click="addStep"
    >
      <IconPlus :size="20" />
      <span class="tw:text-sm tw:font-bold">Add Step</span>
    </button>

    <!-- Add-Step wizard: type → task form (Task only) → assignee roles -->
    <WorkflowStepCreateDialog
      v-model="showCreateDialog"
      :moduleId="moduleId"
      @submit="handleWizardSubmit"
    />
  </div>
</template>
