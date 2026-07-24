<script setup>
import { useDebounceFn } from '@vueuse/core'
import { DELAY_PRESETS } from '@/components/workflow/delayPresets.js'
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

// Adobe e-sign step flags are persisted but their runtime (agreement creation,
// webhook completion, supplier submit selection) isn't shipped yet — keep the
// switches disabled so they can't be toggled into a misleading inert state.
// Flip to true when steps 3–6 of the Adobe Sign integration land.
const ADOBE_ESIGN_READY = false

const step = useLiveQueryWithDeps(
  [() => props.stepId],
  async (db, [stepId]) => {
    if (!stepId) return null
    return await db.WorkflowStep.findByPk(stepId)
  },
  { models: ['WorkflowStep'] },
)

const debouncedStepSave = useDebounceFn(async () => {
  if (!step.value || !props.canUpdate) return
  await step.value.save()
}, 800)

// DELAY config: a preset pill sets the relative window and clears any fixed
// date (window and date are mutually exclusive — the date wins at runtime).
function setDelayDays(days) {
  if (!props.canUpdate || !step.value) return
  step.value.delayDays = days
  step.value.delayUntilDate = null
}

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

  { models: ['WorkflowStepRole'], initial: [] },
)

const stepUsers = useLiveQueryWithDeps(
  [() => props.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return await db.WorkflowStepUser.where('stepId', stepId).exec()
  },

  { models: ['WorkflowStepUser'], initial: [] },
)

const roleIds = computed(() => stepRoles.value.map((sr) => sr.roleId))
const reviewerIds = computed(() => stepUsers.value.map((su) => su.userId))

const assigneesDialogOpen = ref(false)

const showRolesInline = computed(() => props.stepApproversTab !== 'users')
const showUsersInline = computed(() => props.stepApproversTab !== 'roles')

// ─── Editor tabs — progressive disclosure instead of one long scroll ─────────
// Setup (type/name/behavior/compliance) · Task Form (the form the assignee
// fills in — hidden for APPROVAL steps and modules without step forms) ·
// Assignees. Badges surface field/assignee counts without opening the tab.
const activeTab = ref('setup')

const showTaskFormTab = computed(
  () => props.showFormSchema && step.value?.stepType !== 'APPROVAL',
)

// An Action/Delay step without a task form only lets the assignee comment and
// mark complete — almost always a configuration gap. Surfaced as an attention
// dot on the tab, a callout inside it, and a publish-readiness warning.
const missingTaskForm = computed(
  () => showTaskFormTab.value && (step.value?.formSchema?.length ?? 0) === 0,
)

const editorTabs = computed(() => {
  const tabs = [{ value: 'setup', label: 'Setup' }]
  if (showTaskFormTab.value) {
    const count = step.value?.formSchema?.length ?? 0
    tabs.push({
      value: 'form',
      label: 'Task Form',
      ...(count ? { badge: String(count) } : { indicator: true }),
    })
  }
  const assigneeCount = roleIds.value.length + reviewerIds.value.length
  tabs.push({
    value: 'assignees',
    label: 'Assignees',
    ...(assigneeCount ? { badge: String(assigneeCount) } : {}),
  })
  return tabs
})

// Selecting a different step starts back at Setup; if the current tab
// disappears (e.g. type flipped to APPROVAL while on Task Form), snap back.
watch(
  () => props.stepId,
  () => {
    activeTab.value = 'setup'
  },
)
watch(showTaskFormTab, (show) => {
  if (!show && activeTab.value === 'form') activeTab.value = 'setup'
})

// ─── Allowed Outcomes ─────────────────────────────────────────────────────────

const allOutcomes = useLiveQuery(
  async (db) => db.WorkflowStepOutcome.where().orderBy('displayOrder', 'asc').exec(),

  { models: ['WorkflowStepOutcome'], initial: [] },
)

const allowedOutcomes = useLiveQueryWithDeps(
  [() => props.stepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    return await db.AllowedOutcomeOnStep.where('stepId', stepId).exec()
  },

  { models: ['AllowedOutcomeOnStep'], initial: [] },
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
  <div v-if="step" class="tw:space-y-5">
    <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary">
      <IconNote :size="22" />
      <h2 class="tw:text-lg tw:font-semibold tw:text-on-main">Step Configuration: {{ step.name }}</h2>
    </div>

    <!-- Progressive disclosure: Setup / Task Form / Assignees. v-show (not
         v-if) so the autosave watchers and form-builder state survive tab
         switches. -->
    <BaseTabs
      v-model="activeTab"
      :tabs="editorTabs"
      variant="segmented"
      ariaLabel="Step configuration sections"
    />

    <!-- ── Tab: Setup ─────────────────────────────────────────────────── -->
    <div v-show="activeTab === 'setup'" class="tw:space-y-6">
      <!-- 1. Basics — what kind of step it is, its name, and instructions.
           Sectioned cards replace the old two-column split: each concern gets
           one clearly-labelled card so the page reads top-to-bottom. -->
      <div class="tw:rounded-xl tw:border tw:border-divider tw:p-5 tw:space-y-4">
          <!-- Step Type — gates which downstream controls render -->
          <BaseField label="Step Type">
            <div class="tw:grid tw:grid-cols-3 tw:gap-3">
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
                <span class="tw:text-micro tw:leading-tight tw:text-secondary">
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
                <span class="tw:text-micro tw:leading-tight tw:text-secondary">
                  Gate step — approvers review and sign off. Comment-only, no form.
                </span>
              </label>
              <label
                class="tw:relative tw:flex tw:flex-col tw:p-4 tw:border tw:rounded-xl tw:cursor-pointer tw:transition-all"
                :class="
                  step.stepType === 'DELAY'
                    ? 'tw:border-primary tw:bg-primary/5 tw:ring-1 tw:ring-primary/20'
                    : 'tw:border-divider tw:hover:bg-main-hover'
                "
              >
                <input
                  v-model="step.stepType"
                  type="radio"
                  value="DELAY"
                  class="tw:sr-only"
                  :disabled="!canUpdate"
                />
                <span
                  class="tw:text-xs tw:font-bold tw:mb-1"
                  :class="step.stepType === 'DELAY' ? 'tw:text-primary' : 'tw:text-on-main'"
                >
                  DELAY ACTION
                </span>
                <span class="tw:text-micro tw:leading-tight tw:text-secondary">
                  Waits a set number of days, then assigns the task (e.g. effectiveness check).
                </span>
              </label>
            </div>
          </BaseField>

          <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-4">
            <BaseField v-slot="{ id: fieldId }" label="Step Name">
              <BaseTextInput
                :id="fieldId"
                v-model="step.name"
                name="name"
                placeholder="e.g. Peer Review"
                :disabled="!canUpdate"
              />
            </BaseField>
            <BaseField v-slot="{ id: fieldId }" label="Instructions">
              <BaseTextarea
                :id="fieldId"
                v-model="step.description"
                placeholder="What does the assignee need to do?"
                :disabled="!canUpdate"
                rows="2"
              />
            </BaseField>
          </div>
      </div>

      <!-- 2. Behavior — how the step advances (rule / delay default) + timing -->
      <div class="tw:rounded-xl tw:border tw:border-divider tw:p-5 tw:space-y-4">
          <BaseText variant="overline">How this step advances</BaseText>

          <!-- Delay config — only for DELAY steps. This is an OPTIONAL DEFAULT:
               when the workflow reaches the step, the record owner chooses at
               runtime whether to run the check and when (or skip it), like a
               CAPA effectiveness check. A default here just pre-fills that. -->
          <template v-if="step.stepType === 'DELAY'">
            <div
              class="tw:rounded-lg tw:bg-indigo-50 tw:border tw:border-indigo-200 tw:p-2.5 tw:text-micro tw:text-indigo-900 tw:leading-relaxed"
            >
              Optional. The record owner sets the actual activation date — or skips the step —
              when the workflow reaches it. Leave blank to make the owner decide each time.
            </div>
            <BaseField
              v-slot="{ id: fieldId }"
              label="Default delay"
              help="How long the step waits after the previous step completes before assigning its task. The record owner can change or skip this on each record."
            >
              <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                <button
                  v-for="preset in DELAY_PRESETS"
                  :key="preset.days"
                  type="button"
                  class="tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-medium tw:border tw:transition-colors tw:disabled:opacity-50 tw:disabled:cursor-not-allowed"
                  :class="
                    step.delayDays === preset.days && !step.delayUntilDate
                      ? 'tw:bg-primary tw:text-white tw:border-primary'
                      : 'tw:bg-white tw:text-secondary tw:border-divider tw:hover:bg-main-hover'
                  "
                  :disabled="!canUpdate"
                  @click="setDelayDays(preset.days)"
                >
                  {{ preset.label }}
                </button>
                <BaseTextInput
                  :id="fieldId"
                  v-model.number="step.delayDays"
                  type="number"
                  placeholder="Custom"
                  :disabled="!canUpdate"
                  inputClass="tw:w-24"
                  :min="1"
                  @input="step.delayUntilDate = null"
                />
                <span class="tw:text-xs tw:font-medium tw:text-secondary">
                  days after the previous step completes
                </span>
              </div>
            </BaseField>
            <BaseField label="…or default to a specific date">
              <div class="tw:flex tw:items-center tw:gap-2">
                <BaseDateField
                  v-model="step.delayUntilDate"
                  mode="date"
                  :disabled="!canUpdate"
                  clearable
                  @update:modelValue="(v) => v && (step.delayDays = null)"
                />
                <span class="tw:text-xs tw:font-medium tw:text-secondary">
                  Fixed calendar date (overrides the window)
                </span>
              </div>
            </BaseField>
            <BaseField v-slot="{ id: fieldId }" label="Max delay extensions">
              <div class="tw:flex tw:items-center tw:gap-2">
                <BaseTextInput
                  :id="fieldId"
                  v-model.number="step.maxDelayExtensions"
                  type="number"
                  placeholder="1"
                  :disabled="!canUpdate"
                  inputClass="tw:w-24"
                  :min="0"
                />
                <span class="tw:text-xs tw:font-medium tw:text-secondary">
                  How many times the owner/assignee can push the wake-up out (blank = 1)
                </span>
              </div>
            </BaseField>
          </template>

          <!-- Rule — only meaningful for APPROVAL steps. -->
          <BaseField
            v-if="step.stepType === 'APPROVAL' && selectedApprovalRule === null"
            label="Who must approve?"
            help="When several people are assigned to this approval step, this decides whether the workflow waits for everyone or moves on after the first approval."
          >
            <div class="tw:grid tw:grid-cols-2 tw:gap-3 tw:max-w-xl">
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
                  Everyone must approve
                </span>
                <span class="tw:text-micro tw:leading-tight tw:text-secondary">
                  Every assigned approver must sign off before the workflow advances.
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
                  Any one can approve
                </span>
                <span class="tw:text-micro tw:leading-tight tw:text-secondary">
                  The first approval advances the workflow — the others are no longer required.
                </span>
              </label>
            </div>
          </BaseField>

          <!-- SLA — reads as a sentence: "Due within [7] business days of activation" -->
          <BaseField
            v-slot="{ id: fieldId }"
            label="Due within"
            help="SLA — how many business days the assignee has to complete this step once it activates. Drives the task's due date and reminder emails."
          >
            <div class="tw:flex tw:items-center tw:gap-2">
              <BaseTextInput
                :id="fieldId"
                v-model.number="step.slaDays"
                type="number"
                placeholder="e.g. 5"
                :disabled="!canUpdate"
                inputClass="tw:w-24"
                :min="1"
              />
              <span class="tw:text-xs tw:font-medium tw:text-secondary">
                business days of activation
              </span>
            </div>
          </BaseField>

      </div>

      <!-- 3. Compliance & options -->
      <div class="tw:rounded-xl tw:border tw:border-divider tw:p-5 tw:space-y-4">
          <BaseText variant="overline">Compliance &amp; options</BaseText>

          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <label class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer">
              <BaseSwitch v-model="step.requireComments" :disabled="!canUpdate" />
              <span class="tw:text-xs tw:font-semibold tw:text-on-main">Require Comments</span>
            </label>
            <label class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer">
              <BaseSwitch
                v-model="step.requireEsignature"
                :disabled="!canUpdate || step.adobeEsignRequired"
              />
              <span class="tw:text-xs tw:font-semibold tw:text-on-main">Require E-signature</span>
            </label>
          </div>

          <!-- E-signature provider + external signers (Document Control). Adobe
               supersedes the in-app PIN; external_supplier swaps role-based
               internal approvers for supplier users picked at submit.
               Disabled until the Adobe runtime (agreement creation + webhook +
               supplier submit) ships — flip ADOBE_ESIGN_READY then. -->
          <div
            class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3"
            :class="ADOBE_ESIGN_READY ? '' : 'tw:opacity-50'"
          >
            <label class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer">
              <BaseSwitch
                v-model="step.adobeEsignRequired"
                :disabled="!canUpdate || !ADOBE_ESIGN_READY"
              />
              <span class="tw:text-xs tw:font-semibold tw:text-on-main">Adobe e-signature</span>
            </label>
            <label class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer">
              <BaseSwitch
                v-model="step.externalSupplier"
                :disabled="!canUpdate || !ADOBE_ESIGN_READY"
              />
              <span class="tw:text-xs tw:font-semibold tw:text-on-main"
                >External (supplier) signers</span
              >
            </label>
          </div>
          <p v-if="!ADOBE_ESIGN_READY" class="tw:text-caption tw:text-secondary tw:-mt-1">
            Adobe e-signature is coming soon (connect it in Company Settings → Integrations).
          </p>
          <p v-else-if="step.adobeEsignRequired" class="tw:text-caption tw:text-secondary tw:-mt-1">
            Signs via your connected Adobe Acrobat Sign account (Company Settings → Integrations).
            All selected signers must sign before the step completes.
          </p>

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

    <!-- Allowed Outcomes -->
    <div v-if="showAllowedOutcomes" v-show="false" class="tw:space-y-4">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary">
        <IconListCheck :size="22" />
        <h2 class="tw:text-lg tw:font-semibold tw:text-on-main">Allowed Outcomes</h2>
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

    <!-- ── Tab: Task Form — APPROVAL steps are comment-only, so this tab is
         hidden when the type is APPROVAL even if the parent flagged
         showFormSchema. ACTION and DELAY steps both capture data (a DELAY
         step's form is its evidence, e.g. the effectiveness-check record). -->
    <div v-show="activeTab === 'form'" class="tw:space-y-4">
      <div
        v-if="missingTaskForm"
        class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-warning/10 tw:border tw:border-warning/30"
      >
        <IconAlertCircle :size="16" class="tw:text-warning tw:shrink-0 tw:mt-0.5" />
        <p class="tw:text-xs tw:text-warning">
          <strong>This step has no task form.</strong> The assignee will only be able to add a
          comment and mark the step complete — no data or evidence is captured. Most
          {{ step.stepType === 'DELAY' ? 'Delay' : 'Action' }} steps should collect something.
        </p>
      </div>
      <WorkflowStepFormSchema v-if="showTaskFormTab" :stepId="stepId" :canUpdate="canUpdate" />
    </div>

    <!-- ── Tab: Assignees ─────────────────────────────────────────────── -->
    <div v-show="activeTab === 'assignees'" class="tw:space-y-4">
      <BaseSectionHeader
        title="Step Assignees"
        :icon="IconUsers"
        :iconSize="22"
        :level="2"
        size="section-title"
      >
        <template #actions>
          <BaseButton
            v-if="canUpdate"
            variant="outline"
            size="sm"
            @click="assigneesDialogOpen = true"
          >
            <template #icon><IconEdit :size="14" /></template>
            Manage Assignees
          </BaseButton>
        </template>
      </BaseSectionHeader>

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
        <BaseField v-if="showRolesInline" label="Assigned Roles">
          <div v-if="roleIds.length > 0" class="tw:flex tw:flex-wrap tw:gap-2">
            <RoleBadgeById v-for="roleId in roleIds" :key="roleId" :roleId="roleId" />
          </div>
          <span v-else class="tw:text-sm tw:text-secondary">No roles assigned</span>
        </BaseField>

        <BaseField v-if="showUsersInline" label="Assigned Users">
          <div v-if="reviewerIds.length > 0" class="tw:flex tw:flex-wrap tw:gap-2">
            <UserBadgeById v-for="userId in reviewerIds" :key="userId" :userId="userId" />
          </div>
          <span v-else class="tw:text-sm tw:text-secondary">No users assigned</span>
        </BaseField>
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
        <BaseText variant="caption">
          No roles assigned — the submitter will be able to pick any active user for this step.
        </BaseText>
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
