<script setup>
/**
 * Step Settings dialog — the secondary configuration, opened from the gear on
 * a step's header (user request 2026-08-15).
 *
 * The step panel itself now shows only what defines the step: the task form
 * for a Task / Schedule Task, or the approval rule + compliance for an
 * Approval. Everything else — type reference, instructions, SLA, the delay
 * window, compliance for non-approval steps, runtime sub-tasks — lives here so
 * the canvas stays scannable.
 *
 * Self-contained: its own live query + debounced autosave, because the step's
 * inline editor is NOT mounted when the step is collapsed and this dialog is
 * opened from the header.
 */
import { useDebounceFn } from '@vueuse/core'
import { DELAY_PRESETS } from '@/components/workflow/delayPresets.js'
import { IconListCheck, IconRubberStamp, IconClockPause, IconHelpCircle } from '@tabler/icons-vue'
import WorkflowStepComplianceOptions from './WorkflowStepComplianceOptions.vue'

const props = defineProps({
  stepId: { type: String, default: null },
  canUpdate: { type: Boolean, default: false },
  showAllowChildSteps: { type: Boolean, default: false },
})

const isOpen = defineModel({ type: Boolean, default: false })

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

// Flush a pending debounce on close so a fast edit-then-close still persists.
watch(isOpen, (open) => {
  if (!open && props.canUpdate && step.value) step.value.save().catch(() => {})
})

const isApproval = computed(() => step.value?.stepType === 'APPROVAL')
const isDelay = computed(() => step.value?.stepType === 'DELAY')

// Step type is IMMUTABLE once created (chosen in the Add-Step wizard) and is
// already on the step's header card, so this dialog doesn't restate it — only
// the reference guide behind the title's help icon.
const showTypeHelp = ref(false)
const STEP_TYPE_HELP = [
  {
    label: 'Task',
    icon: IconListCheck,
    purpose:
      'A work step. The assignee fills in a task form (evidence, findings, decisions) and marks it complete to advance the workflow. Task steps can allow sub-tasks so the owner can fan work out at runtime.',
    example:
      'Example: "Root Cause Analysis" — the quality engineer completes a 5-Why form and marks the step complete.',
  },
  {
    label: 'Approval',
    icon: IconRubberStamp,
    purpose:
      'A gate step. Approvers review the record and approve or reject — comment-only, no form. Use the ALL/ANY rule to require every approver or just the first one, and require an e-signature for regulated sign-offs.',
    example:
      'Example: "QA Approval" — the Quality Manager reviews and signs off with a CFR 21 Part 11 e-signature.',
  },
  {
    label: 'Effectiveness Check',
    icon: IconClockPause,
    purpose:
      'A follow-up task that activates on a schedule instead of immediately: the step waits a set number of days (or until a date) after the previous step completes, then assigns its task. The record owner can reschedule or skip it on each record.',
    example:
      'Example: "Effectiveness Check" — fires 90 days after the corrective action closes to verify the fix actually worked.',
  },
]

// DELAY config: a preset pill sets the relative window and clears any fixed
// date (window and date are mutually exclusive — the date wins at runtime).
function setDelayDays(days) {
  if (!props.canUpdate || !step.value) return
  step.value.delayDays = days
  step.value.delayUntilDate = null
}
</script>

<template>
  <BaseDialog v-model="isOpen" maxWidth="2xl">
    <!-- Help icon rides the title so the Step Types guide stays reachable
         without the old full-width type card eating dialog space. -->
    <template #title>
      <span class="tw:flex tw:items-center tw:gap-2 tw:min-w-0">
        <span class="tw:truncate">{{ step ? `${step.name} — Settings` : 'Step Settings' }}</span>
        <BaseTooltip content="About step types — what each one is for, with examples">
          <button
            type="button"
            class="tw:shrink-0 tw:p-1 tw:rounded tw:text-secondary tw:hover:text-primary tw:hover:bg-main-hover tw:transition-colors"
            aria-label="About step types"
            @click="showTypeHelp = true"
          >
            <IconHelpCircle :size="16" />
          </button>
        </BaseTooltip>
      </span>
    </template>

    <div v-if="step" class="tw:flex tw:flex-col tw:gap-5 tw:p-1">
      <!-- (No Step Type row — the card header already shows the type, and it
           can't be changed here anyway. The guide lives on the title's help
           icon. 2026-08-15) -->
      <BaseField v-slot="{ id: fieldId }" label="Instructions">
        <BaseTextarea
          :id="fieldId"
          v-model="step.description"
          placeholder="What does the assignee need to do?"
          :disabled="!canUpdate"
          rows="2"
        />
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

      <!-- Delay config — Schedule Task only. OPTIONAL DEFAULT: the record
           owner picks the real activation date (or skips) at runtime. -->
      <template v-if="isDelay">
        <div
          class="tw:rounded-lg tw:bg-indigo-50 tw:border tw:border-indigo-200 tw:p-2.5 tw:text-micro tw:text-indigo-900 tw:leading-relaxed"
        >
          Optional. The record owner sets the actual activation date — or skips the step — when the
          workflow reaches it. Leave blank to make the owner decide each time. On completion the
          assignee records an Effective / Not effective verdict.
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
        <!-- (No verdict opt-out — an Effectiveness Check always records the
             Effective / Not effective outcome; the engine forces
             capturesEffectiveness for DELAY instance steps. 2026-08-28) -->
      </template>

      <!-- Compliance — inline on the panel for APPROVAL steps (it's core
           there), so only non-approval types configure it here. -->
      <BaseField v-if="!isApproval" label="Compliance & options">
        <WorkflowStepComplianceOptions :step="step" :canUpdate="canUpdate" />
      </BaseField>

      <!-- ACTION-only: lets the record owner add ad-hoc sub-tasks from within
           a running record. Approval gates don't fan out into sub-tasks. -->
      <label
        v-if="showAllowChildSteps && step.stepType === 'ACTION' && !step.parentStepId"
        class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer"
      >
        <BaseCheckbox v-model="step.allowChildSteps" :disabled="!canUpdate" />
        <span class="tw:text-xs tw:font-semibold tw:text-on-main">
          Allow adding sub-tasks at runtime
        </span>
      </label>
    </div>

    <template #footer="{ close }">
      <BaseButton variant="primary" @click="close">Done</BaseButton>
    </template>
  </BaseDialog>

  <!-- Step Types guide -->
  <BaseDialog v-model="showTypeHelp" title="Step Types" maxWidth="lg">
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <p class="tw:text-sm tw:text-secondary">
        Every workflow step is one of three types. The type is chosen when the step is added and
        can't be changed afterwards — delete the step and add a new one if you picked the wrong
        type.
      </p>
      <div
        v-for="t in STEP_TYPE_HELP"
        :key="t.label"
        class="tw:flex tw:gap-3 tw:rounded-xl tw:border tw:border-divider tw:p-4"
      >
        <component :is="t.icon" :size="22" class="tw:text-primary tw:shrink-0 tw:mt-0.5" />
        <div class="tw:min-w-0">
          <p class="tw:text-sm tw:font-bold tw:text-on-main">{{ t.label }}</p>
          <p class="tw:text-xs tw:text-secondary tw:mt-1 tw:leading-relaxed">{{ t.purpose }}</p>
          <p class="tw:text-xs tw:text-on-main tw:mt-1.5 tw:italic">{{ t.example }}</p>
        </div>
      </div>
    </div>
    <template #footer="{ close }">
      <BaseButton variant="primary" @click="close">Got it</BaseButton>
    </template>
  </BaseDialog>
</template>
