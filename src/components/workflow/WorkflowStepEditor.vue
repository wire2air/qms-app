<script setup>
import { useDebounceFn } from '@vueuse/core'
import {
  IconNote,
  IconUsers,
  IconInfoCircle,
  IconAlertCircle,
  IconListCheck,
  IconCornerLeftUp,
  IconEdit,
} from '@tabler/icons-vue'

const props = defineProps({
  stepId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
  showAllowedOutcomes: { type: Boolean, default: false },
  showFormSchema: { type: Boolean, default: false },
  showAllowChildSteps: { type: Boolean, default: false },
  stepApproversTab: {
    type: String,
    default: 'both',
    validator: (v) => ['roles', 'users', 'both'].includes(v),
  },
  selectedApprovalRule: {
    type: [String, null],
    default: null,
    validator: (v) => ['ALL', 'ANY', null].includes(v),
  },
})

const step = useLiveQueryWithDeps([() => props.stepId], async (db, [stepId]) => {
  if (!stepId) return null
  return await db.WorkflowStep.findByPk(stepId)
})

const debouncedStepSave = useDebounceFn(async () => {
  if (!step.value || !props.canUpdate) return
  await step.value.save()
}, 800)

watch(
  step,
  (_, oldStep) => {
    if (!props.canUpdate || oldStep === undefined) return
    debouncedStepSave()
  },
  { deep: true },
)

// Step roles and step users counts for warning/error callouts
const stepRoles = useLiveQueryWithDeps(
  [() => props.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return await db.WorkflowStepRole.where('stepId', stepId).exec()
  },
  { initial: [] },
)

const stepUsers = useLiveQueryWithDeps(
  [() => props.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return await db.WorkflowStepUser.where('stepId', stepId).exec()
  },
  { initial: [] },
)

const roleIds = computed(() => stepRoles.value.map((sr) => sr.roleId))
const reviewerIds = computed(() => stepUsers.value.map((su) => su.userId))

const assigneesDialogOpen = ref(false)

const showRolesInline = computed(() => props.stepApproversTab !== 'users')
const showUsersInline = computed(() => props.stepApproversTab !== 'roles')

// ─── Allowed Outcomes ─────────────────────────────────────────────────────────

const allOutcomes = useLiveQuery(
  async (db) => db.WorkflowStepOutcome.where().orderBy('displayOrder', 'asc').exec(),
  { initial: [] },
)

const allowedOutcomes = useLiveQueryWithDeps(
  [() => props.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return await db.AllowedOutcomeOnStep.where('stepId', stepId).exec()
  },
  { initial: [] },
)

const allowedOutcomeIds = computed(() => new Set(allowedOutcomes.value.map((o) => o.outcomeId)))

const toggleOutcome = useLiveMutation(async (db, outcomeId) => {
  const existing = allowedOutcomes.value.find((o) => o.outcomeId === outcomeId)
  if (existing) {
    await existing.delete()
  } else {
    const record = db.AllowedOutcomeOnStep.create({ stepId: props.stepId, outcomeId })
    await record.save()
  }
})

watch(
  () => props.selectedApprovalRule,
  (newRule) => {
    if (!step.value || !props.canUpdate || !newRule) return
    step.value.approvalRule = newRule
    step.value.save()
  },
)
</script>

<template>
  <div v-if="step" class="tw:space-y-10">
    <!-- Step Details -->
    <div class="tw:space-y-6">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary tw:mb-2">
        <IconNote :size="22" />
        <h2 class="tw:text-lg tw:font-bold tw:text-on-main">Step Configuration: {{ step.name }}</h2>
      </div>

      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-6">
        <!-- Left Column -->
        <div class="tw:space-y-4">
          <div>
            <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-2">
              Step Name
            </label>
            <BaseTextInput
              v-model="step.name"
              name="name"
              placeholder="e.g. Peer Review"
              :disabled="!canUpdate"
            />
          </div>
          <div>
            <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-2">
              Instructions
            </label>
            <BaseTextarea
              v-model="step.description"
              placeholder="What does the assignee need to do?"
              :disabled="!canUpdate"
              rows="3"
            />
          </div>
        </div>

        <!-- Right Column -->
        <div class="tw:space-y-6">
          <!-- Step Type — gates which downstream controls render -->
          <div>
            <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-3">
              Step Type
            </label>
            <div class="tw:grid tw:grid-cols-2 tw:gap-3">
              <label
                class="tw:relative tw:flex tw:flex-col tw:p-4 tw:border tw:rounded-xl tw:cursor-pointer tw:transition-all"
                :class="
                  step.stepType === 'ACTION'
                    ? 'tw:border-primary tw:bg-primary/5 tw:ring-1 tw:ring-primary/20'
                    : 'tw:border-divider tw:hover:bg-main-hover'
                "
              >
                <input
                  v-model="step.stepType"
                  type="radio"
                  value="ACTION"
                  class="tw:sr-only"
                  :disabled="!canUpdate"
                />
                <span
                  class="tw:text-xs tw:font-bold tw:mb-1"
                  :class="step.stepType === 'ACTION' ? 'tw:text-primary' : 'tw:text-on-main'"
                >
                  ACTION
                </span>
                <span class="tw:text-[10px] tw:leading-tight tw:text-secondary">
                  Work step. Form fields, optional sub-tasks. Assignee clicks Mark Complete.
                </span>
              </label>
              <label
                class="tw:relative tw:flex tw:flex-col tw:p-4 tw:border tw:rounded-xl tw:cursor-pointer tw:transition-all"
                :class="
                  step.stepType === 'APPROVAL'
                    ? 'tw:border-primary tw:bg-primary/5 tw:ring-1 tw:ring-primary/20'
                    : 'tw:border-divider tw:hover:bg-main-hover'
                "
              >
                <input
                  v-model="step.stepType"
                  type="radio"
                  value="APPROVAL"
                  class="tw:sr-only"
                  :disabled="!canUpdate"
                />
                <span
                  class="tw:text-xs tw:font-bold tw:mb-1"
                  :class="step.stepType === 'APPROVAL' ? 'tw:text-primary' : 'tw:text-on-main'"
                >
                  APPROVAL
                </span>
                <span class="tw:text-[10px] tw:leading-tight tw:text-secondary">
                  Gate step. ALL or ANY approvers must sign. Comment-only — no form.
                </span>
              </label>
            </div>
          </div>

          <!-- Rule — only meaningful for APPROVAL steps. -->
          <div v-if="step.stepType === 'APPROVAL' && selectedApprovalRule === null">
            <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-3">
              Rule
            </label>
            <div class="tw:grid tw:grid-cols-2 tw:gap-3">
              <label
                class="tw:relative tw:flex tw:flex-col tw:p-4 tw:border tw:rounded-xl tw:cursor-pointer tw:transition-all"
                :class="
                  step.approvalRule === 'ALL'
                    ? 'tw:border-primary tw:bg-primary/5 tw:ring-1 tw:ring-primary/20'
                    : 'tw:border-divider tw:hover:bg-main-hover'
                "
              >
                <input
                  v-model="step.approvalRule"
                  type="radio"
                  value="ALL"
                  class="tw:sr-only"
                  :disabled="!canUpdate"
                />
                <span
                  class="tw:text-xs tw:font-bold tw:mb-1"
                  :class="step.approvalRule === 'ALL' ? 'tw:text-primary' : 'tw:text-on-main'"
                >
                  ALL
                </span>
                <span class="tw:text-[10px] tw:leading-tight tw:text-secondary">
                  All assigned tasks must be completed to advance.
                </span>
              </label>
              <label
                class="tw:relative tw:flex tw:flex-col tw:p-4 tw:border tw:rounded-xl tw:cursor-pointer tw:transition-all"
                :class="
                  step.approvalRule === 'ANY'
                    ? 'tw:border-primary tw:bg-primary/5 tw:ring-1 tw:ring-primary/20'
                    : 'tw:border-divider tw:hover:bg-main-hover'
                "
              >
                <input
                  v-model="step.approvalRule"
                  type="radio"
                  value="ANY"
                  class="tw:sr-only"
                  :disabled="!canUpdate"
                />
                <span
                  class="tw:text-xs tw:font-bold tw:mb-1"
                  :class="step.approvalRule === 'ANY' ? 'tw:text-primary' : 'tw:text-on-main'"
                >
                  ANY
                </span>
                <span class="tw:text-[10px] tw:leading-tight tw:text-secondary">
                  Only one task needs to be completed to advance.
                </span>
              </label>
            </div>
          </div>

          <!-- SLA Days -->
          <div>
            <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-2">
              SLA: Due in (days)
            </label>
            <div class="tw:flex tw:items-center tw:gap-2">
              <BaseTextInput
                v-model.number="step.slaDays"
                type="number"
                placeholder="e.g. 5"
                :disabled="!canUpdate"
                inputClass="tw:w-24"
                :min="1"
              />
              <span class="tw:text-xs tw:font-medium tw:text-secondary">
                Business days from activation
              </span>
            </div>
          </div>

          <!-- Compliance Controls -->
          <div class="tw:flex tw:justify-between">
            <label class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer">
              <BaseSwitch v-model="step.requireComments" :disabled="!canUpdate" />
              <span class="tw:text-xs tw:font-semibold tw:text-on-main">Require Comments</span>
            </label>
            <label class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer">
              <BaseSwitch v-model="step.requireEsignature" :disabled="!canUpdate" />
              <span class="tw:text-xs tw:font-semibold tw:text-on-main">Require E-signature</span>
            </label>
          </div>

          <!-- ACTION-only: lets the resource owner add ad-hoc child steps
               from within a running record. Hidden for APPROVAL steps —
               approval gates don't fan out into sub-tasks. -->
          <label
            v-if="showAllowChildSteps && step.stepType === 'ACTION' && !step.parentStepId"
            class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer"
          >
            <BaseCheckbox v-model="step.allowChildSteps" :disabled="!canUpdate" />
            <span class="tw:text-xs tw:font-semibold tw:text-on-main">
              Allow adding child steps at runtime
            </span>
          </label>
        </div>
      </div>
    </div>

    <!-- Allowed Outcomes -->
    <div v-if="showAllowedOutcomes" v-show="false" class="tw:space-y-4">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary">
        <IconListCheck :size="22" />
        <h2 class="tw:text-lg tw:font-bold tw:text-on-main">Allowed Outcomes</h2>
      </div>
      <p class="tw:text-xs tw:text-secondary">
        Actions the assignee can take to complete this step. Each outcome triggers a different path
        in the workflow.
      </p>
      <div class="tw:flex tw:flex-wrap tw:gap-2 tw:mt-2">
        <BaseButton
          v-for="o in allOutcomes"
          :key="o.id"
          :variant="allowedOutcomeIds.has(o.id) ? 'primary' : 'outline'"
          size="md"
          :disabled="!canUpdate"
          @click="toggleOutcome(o.id)"
        >
          <template #icon>
            <component
              :is="
                o.id === 'APPROVE'
                  ? IconCheck
                  : o.id === 'REJECT'
                    ? IconX
                    : o.id === 'SEND_BACK'
                      ? IconCornerLeftUp
                      : IconListCheck
              "
              :size="14"
            />
          </template>
          {{ o.name }}
        </BaseButton>
      </div>
    </div>

    <!-- Form Schema — APPROVAL steps are comment-only, so the form
         builder is hidden when the type is APPROVAL even if the
         parent flagged showFormSchema. -->
    <WorkflowStepFormSchema
      v-if="showFormSchema && step.stepType === 'ACTION'"
      :stepId="stepId"
      :canUpdate="canUpdate"
    />

    <!-- Step Assignee -->
    <div class="tw:space-y-4">
      <div class="tw:flex tw:items-center tw:justify-between">
        <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary">
          <IconUsers :size="22" />
          <h2 class="tw:text-lg tw:font-bold tw:text-on-main">Step Assignees</h2>
        </div>
        <BaseButton
          v-if="canUpdate"
          variant="outline"
          size="sm"
          @click="assigneesDialogOpen = true"
        >
          <template #icon><IconEdit :size="14" /></template>
          Manage Assignees
        </BaseButton>
      </div>

      <!-- Warning Callout -->
      <div
        v-if="roleIds.length > 0 && reviewerIds.length > 0"
        class="tw:bg-warning/10 tw:border tw:border-warning/30 tw:p-4 tw:rounded-xl tw:flex tw:gap-3"
      >
        <IconInfoCircle :size="20" class="tw:text-warning tw:shrink-0" />
        <div class="tw:text-xs tw:text-warning">
          <p class="tw:font-bold tw:mb-0.5">Union Selection Logic</p>
          <p>
            Selecting both roles and individual users will result in a
            <strong>union</strong> of all participants being assigned to this step.
          </p>
        </div>
      </div>

      <!-- Assigned Roles / Users (read-only display) -->
      <div class="tw:border tw:border-divider tw:rounded-xl tw:p-6 tw:space-y-5">
        <div v-if="showRolesInline">
          <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-2">
            Assigned Roles
          </label>
          <div v-if="roleIds.length > 0" class="tw:flex tw:flex-wrap tw:gap-2">
            <RoleBadgeById v-for="roleId in roleIds" :key="roleId" :roleId="roleId" />
          </div>
          <span v-else class="tw:text-sm tw:text-secondary">No roles assigned</span>
        </div>

        <div v-if="showUsersInline">
          <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-2">
            Assigned Users
          </label>
          <div v-if="reviewerIds.length > 0" class="tw:flex tw:flex-wrap tw:gap-2">
            <UserBadgeById v-for="userId in reviewerIds" :key="userId" :userId="userId" />
          </div>
          <span v-else class="tw:text-sm tw:text-secondary">No users assigned</span>
        </div>
      </div>

      <!-- Approver hint — role assignment is OPTIONAL at the template
           level. When a step has no roles, the submit-time picker
           shows every active user instead of filtering by role pool
           (matches the no-friction rule small teams want; bigger
           teams keep using roles to constrain who's eligible). -->
      <div
        v-if="roleIds.length === 0 && reviewerIds.length === 0"
        class="tw:flex tw:items-center tw:gap-2 tw:text-secondary tw:px-1"
      >
        <IconAlertCircle :size="14" class="tw:text-secondary" />
        <span class="ds-label-sm">
          No roles assigned — the submitter will be able to pick any active user for this step.
        </span>
      </div>
    </div>

    <!-- Manage Assignees Dialog -->
    <WorkflowStepAssigneesDialog
      v-model="assigneesDialogOpen"
      :stepId="step.id"
      :canUpdate="canUpdate"
      :stepApproversTab="stepApproversTab"
    />

    <!-- Send-back target picker removed: the engine now auto-targets the
         entity owner (for a parent step) or the parent step's assignee
         (for a child task). No per-template config needed. -->
  </div>
</template>
