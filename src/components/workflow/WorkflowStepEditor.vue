<script setup>
/**
 * The CORE of a workflow step — what the panel shows inline under the step's
 * header card. Trimmed to the one thing that defines each type (user request
 * 2026-08-15); everything else moved behind the header's gear/people buttons:
 *
 *   Task / Schedule Task → the task form (what the assignee captures)
 *   Approval            → who must approve + compliance (the gate's rules)
 *
 * Secondary config (type reference, instructions, SLA, delay window,
 * compliance for non-approval types, runtime sub-tasks) lives in
 * WorkflowStepSettingsDialog; assignees in WorkflowStepAssigneesDialog. Both
 * are opened from WorkflowStepCard's header, so they work whether or not the
 * step is expanded.
 */
import { useDebounceFn } from '@vueuse/core'
import { IconAlertCircle } from '@tabler/icons-vue'
import WorkflowStepComplianceOptions from './WorkflowStepComplianceOptions.vue'

const props = defineProps({
  stepId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
  showFormSchema: { type: Boolean, default: false },
  selectedApprovalRule: {
    type: [String, null],
    default: null,
    validator: (v) => ['ALL', 'ANY', null].includes(v),
  },
})

const emit = defineEmits(['openAssignees'])

const step = useLiveQueryWithDeps(
  [() => props.stepId],
  async (db, [stepId]) => (stepId ? db.WorkflowStep.findByPk(stepId) : null),
  { models: ['WorkflowStep'] },
)

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

const isApproval = computed(() => step.value?.stepType === 'APPROVAL')

// Task forms: every module whose runtime renders <WorkflowStep> (all but
// Document Control — see WorkflowEditor), and never on an APPROVAL step,
// which is comment-only by design.
const showTaskForm = computed(() => props.showFormSchema && !isApproval.value)

// An Action/Delay step without a task form only lets the assignee comment and
// mark complete — almost always a configuration gap. Also surfaced as a
// publish-readiness warning.
const missingTaskForm = computed(
  () => showTaskForm.value && (step.value?.formSchema?.length ?? 0) === 0,
)

// The ALL/ANY picker is hidden when the module pins the rule for every step.
const showApprovalRule = computed(() => isApproval.value && props.selectedApprovalRule === null)
</script>

<template>
  <div v-if="step" class="tw:space-y-4">
    <!-- ── Approval steps: the gate's rules ─────────────────────────────── -->
    <template v-if="isApproval">
      <!-- WHO signs. Previously only reachable through the people icon on the
           step header, so an approval step showed its ALL/ANY rule but never
           the roles it applied to — the single most important fact about a
           gate (user report 2026-08-15). Read-only here; the dialog behind
           "Change" is still the editor. -->
      <BaseField label="Approvers">
        <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <WorkflowStepRoleBadges :stepId="stepId" />
          <button
            v-if="canUpdate"
            type="button"
            class="tw:text-xs tw:font-medium tw:text-primary tw:hover:text-primary/80 tw:transition-colors"
            @click="emit('openAssignees')"
          >
            Change
          </button>
        </div>
      </BaseField>

      <BaseField
        v-if="showApprovalRule"
        label="Who must approve?"
        help="When several people are assigned to this approval step, this decides whether the workflow waits for everyone or moves on after the first approval."
      >
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3 tw:max-w-xl">
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

      <BaseField label="Compliance & options">
        <WorkflowStepComplianceOptions :step="step" :canUpdate="canUpdate" />
      </BaseField>
    </template>

    <!-- ── Task / Schedule Task: the form the assignee fills in ──────────── -->
    <template v-else-if="showTaskForm">
      <!-- Instructions for whoever gets the task. Same field the Settings
           dialog edits (step.description) — surfaced here because on a Task
           step it is part of authoring the task, not a setting you go looking
           for (user request 2026-08-16).
           Single line, unlabelled: the placeholder says what it is, and a
           heading above a one-line box is more chrome than content. -->
      <BaseTextInput
        v-model="step.description"
        size="sm"
        :disabled="!canUpdate"
        placeholder="Instructions for the assignee (optional) — what do they need to do?"
      />

      <div
        v-if="missingTaskForm"
        class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:bg-warning/10 tw:border tw:border-warning/30"
      >
        <IconAlertCircle :size="16" class="tw:text-warning tw:shrink-0 tw:mt-0.5" />
        <p class="tw:text-xs tw:text-warning">
          <strong>This step has no task form.</strong> The assignee will only be able to add a
          comment and mark the step complete — no data or evidence is captured.
        </p>
      </div>
      <!-- hideHeader: the step panel shows nothing but this form, so its
           title/blurb/entry-point buttons were redundant chrome. -->
      <WorkflowStepFormSchema :stepId="stepId" :canUpdate="canUpdate" hideHeader />
    </template>

    <!-- Modules without step forms (Document Control): nothing is core here,
         so point at where the configuration actually lives. -->
    <p v-else class="tw:text-sm tw:text-secondary tw:italic">
      This step has no task form. Use <strong>Settings</strong> and <strong>Assignees</strong> in
      the step header to configure it.
    </p>
  </div>
</template>
