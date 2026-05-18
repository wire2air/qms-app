<script setup>
import { IconPlus } from '@tabler/icons-vue'
import { currentCompany } from '@/utils/currentCompany.js'

const props = defineProps({
  versionId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
  showChildSteps: { type: Boolean, default: false },
})

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
  { initial: [] },
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

function selectStep(step) {
  stepId.value = step.id
}

const createStep = useLiveMutation(async (db, { versionId, order, settings, parentStepId }) => {
  const s = settings || {}
  const step = db.WorkflowStep.create({
    workflowVersionId: versionId,
    name: `Step ${order}`,
    description: '',
    stepOrder: order,
    approvalRule: s.defaultWorkflowApprovalRule ?? 'ALL',
    slaDays: s.defaultSla ?? null,
    requireComments: s.defaultWorkflowRequireComment ?? false,
    requireEsignature: s.defaultWorkflowRequireSignature ?? false,
    ...(parentStepId ? { parentStepId } : {}),
  })
  await step.save()

  // Seed all allowed outcomes for the new step
  const outcomes = await db.WorkflowStepOutcome.where().exec()
  for (const o of outcomes) {
    const record = db.AllowedOutcomeOnStep.create({ stepId: step.id, outcomeId: o.id })
    await record.save()
  }

  return step
})

function nextStepOrder() {
  const orders = steps.value.map((s) => s.stepOrder ?? 0)
  return (orders.length ? Math.max(...orders) : 0) + 1
}

async function addStep() {
  const s = currentCompany.value?.settings || {}
  const order = nextStepOrder()
  const step = await createStep({ versionId: props.versionId, order, settings: s })
  if (step) stepId.value = step.id
}

async function addChildStep(parentId) {
  const s = currentCompany.value?.settings || {}
  const order = nextStepOrder()
  const step = await createStep({
    versionId: props.versionId,
    order,
    settings: s,
    parentStepId: parentId,
  })
  if (step) stepId.value = step.id
}

// Generic helpers for scoped remove/swap
async function removeFromSiblings(step, siblings) {
  const index = siblings.findIndex((s) => s.id === step.id)
  if (index === -1) return
  const wasSelected = stepId.value === step.id
  await step.delete()
  const remaining = siblings.filter((s) => s.id !== step.id)
  if (wasSelected) {
    const newIndex = Math.max(0, index - 1)
    stepId.value = remaining[newIndex]?.id ?? null
  }
}

async function swapInList(list, fromIndex, toIndex) {
  const a = list[fromIndex]
  const b = list[toIndex]
  if (!a || !b) return
  const tmpOrder = a.stepOrder
  a.stepOrder = b.stepOrder
  b.stepOrder = tmpOrder
  await Promise.all([a.save(), b.save()])
  stepId.value = a.id
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
  <aside
    class="tw:w-80 tw:lg:w-96 tw:bg-main-hover tw:border-r tw:border-divider tw:flex tw:flex-col tw:shrink-0"
  >
    <!-- Header -->
    <div class="tw:p-4 tw:border-b tw:border-divider tw:flex tw:items-center tw:justify-between">
      <h2 class="ds-label tw:text-on-main">Workflow Sequence</h2>
      <span
        class="tw:text-xs tw:font-medium tw:text-secondary tw:bg-main tw:px-2 tw:py-0.5 tw:rounded"
      >
        {{ steps?.length ?? 0 }} Step{{ (steps?.length ?? 0) !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- Step Cards -->
    <div class="tw:flex-1 tw:overflow-y-auto tw:p-4 tw:space-y-3">
      <!-- Nested mode -->
      <template v-if="showChildSteps">
        <div v-for="(step, index) in rootSteps" :key="step.id ?? index" class="tw:space-y-2">
          <WorkflowStepCard
            :step="step"
            :index="index"
            :isSelected="step.id === stepId"
            :isFirst="index === 0"
            :isLast="index === rootSteps.length - 1"
            :canUpdate="canUpdate"
            @select="selectStep(step)"
            @remove="removeRootStep(index)"
            @moveUp="moveRootStepUp(index)"
            @moveDown="moveRootStepDown(index)"
          />

          <!-- Child steps -->
          <div class="tw:pl-6 tw:space-y-2">
            <WorkflowStepCard
              v-for="(child, ci) in childrenByParentId[step.id] ?? []"
              :key="child.id"
              :step="child"
              :index="ci"
              :isChild="true"
              :isSelected="child.id === stepId"
              :isFirst="ci === 0"
              :isLast="ci === (childrenByParentId[step.id] ?? []).length - 1"
              :canUpdate="canUpdate"
              @select="selectStep(child)"
              @remove="removeChildStep(step.id, ci)"
              @moveUp="moveChildStepUp(step.id, ci)"
              @moveDown="moveChildStepDown(step.id, ci)"
            />

            <!-- Add Sub-step Button — always available in the template editor.
                 `allowChildSteps` governs runtime ad-hoc child additions in
                 CAPAs, not template authoring. -->
            <button
              v-if="canUpdate"
              class="tw:w-full tw:py-2 tw:border tw:border-dashed tw:border-divider tw:rounded-lg tw:flex tw:items-center tw:justify-center tw:gap-1.5 tw:text-secondary tw:hover:text-primary tw:hover:border-primary tw:hover:bg-primary/5 tw:transition-all"
              @click="addChildStep(step.id)"
            >
              <IconPlus :size="14" />
              <span class="tw:text-xs tw:font-bold">Add Sub-step</span>
            </button>
          </div>
        </div>
      </template>

      <!-- Flat mode -->
      <template v-else>
        <WorkflowStepCard
          v-for="(step, index) in steps"
          :key="step.id ?? index"
          :step="step"
          :index="index"
          :isSelected="step.id === stepId"
          :isFirst="index === 0"
          :isLast="index === steps.length - 1"
          :canUpdate="canUpdate"
          @select="selectStep(step)"
          @remove="removeStep(index)"
          @moveUp="moveStepUp(index)"
          @moveDown="moveStepDown(index)"
        />
      </template>

      <!-- Add Step Button -->
      <button
        v-if="canUpdate"
        class="tw:w-full tw:py-4 tw:border-2 tw:border-dashed tw:border-divider tw:rounded-xl tw:flex tw:items-center tw:justify-center tw:gap-2 tw:text-secondary tw:hover:text-primary tw:hover:border-primary tw:hover:bg-primary/5 tw:transition-all"
        @click="addStep"
      >
        <IconPlus :size="20" />
        <span class="tw:text-sm tw:font-bold">Add Step</span>
      </button>
    </div>
  </aside>
</template>
