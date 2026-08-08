<script setup>
/**
 * AI-generate a whole workflow template from a plain-language process
 * description. "AI drafts, human approves":
 *   1. User picks the module + describes the process → POST
 *      /v1/services/ai/tasks/workflow.generate_template/run. The model returns
 *      { name, description?, steps[] } where each step carries role IDs (from
 *      the tenant's real roles), ALL/ANY rule, SLA, e-sign flags and — for
 *      step-config modules — a lightweight per-step form descriptor list.
 *   2. A preview shows every step (roles resolved as badges, unknown role IDs
 *      dropped and flagged). On confirm we create the Workflow + a DRAFT
 *      WorkflowVersion + steps/roles via the user's own syncEngine mutations
 *      and land them in the builder. Nothing can run until the user reviews
 *      the draft there and explicitly PUBLISHES it (the publish guard also
 *      rejects steps with no assignees).
 *
 * AI-sidecar isolation: this component owns the AI call; the host only mounts
 * it behind `v-if="canUseAi"` and reacts to @created. No AI logic in the host.
 */
import {
  IconSparkles,
  IconAlertTriangle,
  IconWand,
  IconSignature,
  IconMessage,
  IconClock,
  IconForms,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { hydrateAiFields } from '@/utils/aiFormHydrate'
import { currentCompany } from '@/utils/currentCompany.js'

const emit = defineEmits(['created'])

const show = defineModel({ type: Boolean, default: false })

// Mirror of WORKFLOW_MODULES_WITH_STEP_CONFIG in WorkflowEditor.vue (and of
// MODULES_WITH_STEP_FORMS in the backend task) — only these modules render
// per-step data-capture forms.
const MODULES_WITH_STEP_FORMS = [
  'NON_CONFORMANCE',
  'CAPA',
  'CHANGE_CONTROL',
  'CUSTOMER_COMPLAINT',
  'COMPLAINT',
]

// Example prompts per module, shown as clickable chips so users understand
// what kind of process to describe. Falls back to DEFAULT for other modules.
const EXAMPLE_PROMPTS = {
  NON_CONFORMANCE: [
    'Nonconformance handling: investigation with root cause, risk assessment, then a QA disposition review with e-signature.',
    'Supplier nonconformance: immediate containment, supplier root-cause response, corrective-action verification, and a QA close-out.',
  ],
  CAPA: [
    'A CAPA process: investigation, root cause analysis, a corrective & preventive action plan, implementation, then a 90-day effectiveness check.',
    'An 8D supplier corrective action (SCAR): D3 containment, D4 root cause, D5 corrective-action plan, D6/D7 implementation & prevention, and D8 customer verification with e-signature.',
  ],
  CHANGE_CONTROL: [
    'A change control flow: impact & risk assessment, technical review, QA approval, implementation, then a post-implementation verification.',
    'An engineering change: proposal review, cross-functional impact assessment, management approval with e-signature, and rollout confirmation.',
  ],
  CUSTOMER_COMPLAINT: [
    'A customer complaint investigation: intake triage, investigation with root cause, corrective action, and a QA closure review with e-signature.',
  ],
  COMPLAINT: [
    'A complaint investigation: intake triage, investigation with root cause, corrective action, and a QA closure review with e-signature.',
  ],
  DEFAULT: [
    'A two-stage document approval: author submits, QA reviews, then management approves with e-signature.',
    'A simple review-and-sign-off: a reviewer checks the record, then a manager approves.',
  ],
}

const moduleId = ref(null)
const prompt = ref('')
const context = ref('')
const generating = ref(false)
const creating = ref(false)
const preview = ref(null) // { name, description?, steps[] }
const error = ref(null)

watch(show, (open) => {
  if (!open) return
  moduleId.value = null
  prompt.value = ''
  context.value = ''
  preview.value = null
  error.value = null
})

function close() {
  show.value = false
}

// The tenant's active roles — used to validate the AI's roleIds so a
// hallucinated ID can never reach a WorkflowStepRole row.
const roles = useLiveQuery((db) => db.Role.where('statusId', 'ACTIVE').exec(), {
  models: ['Role'],
  initial: [],
})
const knownRoleIds = computed(() => new Set((roles.value ?? []).map((r) => r.id)))

const supportsStepForms = computed(() => MODULES_WITH_STEP_FORMS.includes(moduleId.value))

// Example prompts for the selected module (or the generic fallback).
const examplePrompts = computed(() => EXAMPLE_PROMPTS[moduleId.value] ?? EXAMPLE_PROMPTS.DEFAULT)

// Preview steps with unknown role IDs dropped; `missingRoles` flags a step the
// reviewer must reassign in the builder (publish blocks role-less steps).
const previewSteps = computed(() => {
  const steps = preview.value?.steps ?? []
  return steps.map((s, i) => {
    const validRoleIds = (s.roleIds ?? []).filter((id) => knownRoleIds.value.has(id))
    const fieldCount =
      supportsStepForms.value && s.stepType !== 'APPROVAL' && Array.isArray(s.fields)
        ? s.fields.length
        : 0
    return { ...s, order: i + 1, validRoleIds, missingRoles: !validRoleIds.length, fieldCount }
  })
})

const stepsWithoutRoles = computed(() => previewSteps.value.filter((s) => s.missingRoles).length)
const stepCount = computed(() => previewSteps.value.length)

// Generation is expensive; match the form generator's 3-min ceiling.
const AI_GENERATE_TIMEOUT_MS = 3 * 60_000

async function generate() {
  if (generating.value || !moduleId.value || !prompt.value.trim()) return
  generating.value = true
  preview.value = null
  error.value = null
  try {
    const res = await post(
      '/v1/services/ai/tasks/workflow.generate_template/run',
      {
        moduleId: moduleId.value,
        prompt: prompt.value.trim(),
        context: context.value.trim() || undefined,
      },
      { timeout: AI_GENERATE_TIMEOUT_MS },
    )
    const out = res?.result
    if (!out?.steps?.length) {
      error.value = 'The AI didn\'t return any steps. Try describing the process in more detail.'
      return
    }
    preview.value = out
  } catch (err) {
    error.value = err?.message || 'AI generation failed'
  } finally {
    generating.value = false
  }
}

// Create the workflow + first DRAFT version + steps/roles from the confirmed
// preview. Mirrors WorkflowGuidedCreateDialog's create flow (incl. the per-step
// AllowedOutcomeOnStep seeding); the DRAFT status is the human-approval gate.
const createDraftWorkflow = useLiveMutation(async (db) => {
  const settings = currentCompany.value?.settings || {}

  const workflow = db.Workflow.create({
    name: preview.value.name,
    description: preview.value.description || '',
    moduleId: moduleId.value,
    statusId: 'ACTIVE',
  })
  await workflow.save()

  const version = db.WorkflowVersion.create({
    workflowId: workflow.id,
    versionMajor: 1,
    versionMinor: 0,
    statusId: 'DRAFT',
  })
  await version.save()

  const outcomes = await db.WorkflowStepOutcome.where().exec()

  for (const s of previewSteps.value) {
    const step = db.WorkflowStep.create({
      workflowVersionId: version.id,
      name: s.name,
      description: s.description || '',
      stepOrder: s.order,
      stepType: s.stepType || 'ACTION',
      approvalRule: s.approvalRule ?? settings.defaultWorkflowApprovalRule ?? 'ALL',
      slaDays: s.slaDays ?? settings.defaultSla ?? null,
      // DELAY steps: wake-up delay + extension cap from the AI draft.
      delayDays: s.stepType === 'DELAY' ? (s.delayDays ?? null) : null,
      maxDelayExtensions: s.stepType === 'DELAY' ? (s.maxDelayExtensions ?? null) : null,
      requireComments: s.requireComments ?? settings.defaultWorkflowRequireComment ?? false,
      requireEsignature: s.requireEsignature ?? settings.defaultWorkflowRequireSignature ?? false,
      // Hydrate AI field descriptors through the builder's real field factory
      // so the stored schema is always structurally valid. ACTION and DELAY
      // steps both capture data; APPROVAL steps are comment-only.
      formSchema:
        supportsStepForms.value && s.stepType !== 'APPROVAL' && s.fields?.length
          ? hydrateAiFields(s.fields)
          : [],
    })
    await step.save()

    for (const roleId of s.validRoleIds) {
      const stepRole = db.WorkflowStepRole.create({ stepId: step.id, roleId })
      await stepRole.save()
    }

    // Seed every allowed outcome on the step (mirrors
    // WorkflowGuidedCreateDialog / WorkflowStepList.createStep).
    for (const o of outcomes) {
      const record = db.AllowedOutcomeOnStep.create({ stepId: step.id, outcomeId: o.id })
      await record.save()
    }
  }

  return workflow
})

async function createAsDraft() {
  if (creating.value || !preview.value) return
  creating.value = true
  error.value = null
  try {
    const workflow = await createDraftWorkflow()
    if (workflow) {
      emit('created', workflow)
      close()
    }
  } catch (err) {
    error.value = err?.message || 'Failed to create the workflow draft'
  } finally {
    creating.value = false
  }
}

function ruleLabel(step) {
  return (step.approvalRule ?? 'ALL') === 'ANY' ? 'Any assignee' : 'All assignees'
}
</script>

<template>
  <BaseDialog :modelValue="show" title="Generate workflow with AI" maxWidth="2xl" @update:modelValue="close">
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <!-- Context strip -->
      <div
        class="tw:rounded-lg tw:bg-purple-50 tw:border tw:border-purple-200 tw:p-3 tw:text-xs tw:text-purple-900 tw:leading-relaxed tw:flex tw:items-start tw:gap-2"
      >
        <IconSparkles :size="16" class="tw:shrink-0 tw:mt-0.5" />
        <span>
          Describe the process and the AI drafts the whole workflow — steps, role
          assignments from your roles, and step forms where the module supports
          them. <strong>It is created as a draft:</strong> nothing runs until you
          review it in the builder and publish it.
        </span>
      </div>

      <BaseField v-slot="{ id: fieldId }" label="Module">
        <ModuleSelectMenu :id="fieldId" v-model="moduleId" :required="true" />
      </BaseField>

      <BaseField v-slot="{ id: fieldId }" label="What process should the workflow implement?">
        <BaseTextarea
          :id="fieldId"
          v-model="prompt"
          :rows="4"
          placeholder="Describe the process in plain language — the steps, who does each one, and any sign-offs. e.g. An 8D supplier corrective action: containment, root cause, corrective actions, effectiveness check, and a final QA close-out with e-signature."
          :required="true"
        />
        <!-- Example prompts — click to fill. Helps users see what to ask for. -->
        <div class="tw:mt-2 tw:flex tw:flex-col tw:gap-1.5">
          <span class="tw:text-micro tw:text-secondary">Need ideas? Try an example:</span>
          <div class="tw:flex tw:flex-wrap tw:gap-1.5">
            <button
              v-for="(ex, i) in examplePrompts"
              :key="i"
              type="button"
              class="tw:text-left tw:text-micro tw:leading-snug tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover/40 tw:px-2.5 tw:py-1.5 tw:text-secondary tw:hover:border-primary tw:hover:text-primary tw:transition-colors"
              @click="prompt = ex"
            >
              {{ ex }}
            </button>
          </div>
        </div>
      </BaseField>

      <BaseField v-slot="{ id: fieldId }" label="Additional context" optional>
        <BaseTextarea
          :id="fieldId"
          v-model="context"
          :rows="2"
          placeholder="Industry/sector, standards it supports, SLAs, or specific steps you want included…"
        />
      </BaseField>

      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton
          variant="primary"
          :loading="generating"
          :disabled="generating || !moduleId || !prompt.trim()"
          @click="generate"
        >
          <template #icon><IconWand :size="16" /></template>
          {{ preview ? 'Regenerate' : 'Generate' }}
        </BaseButton>
        <span v-if="generating" class="tw:text-xs tw:text-secondary">
          Drafting the workflow… this can take up to a minute.
        </span>
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="tw:rounded-lg tw:border tw:border-red-300 tw:bg-red-50 tw:p-3 tw:text-xs tw:text-red-800 tw:flex tw:items-start tw:gap-2"
      >
        <IconAlertTriangle :size="16" class="tw:shrink-0 tw:mt-0.5" />
        <span>{{ error }}</span>
      </div>

      <!-- Preview -->
      <div v-if="preview" class="tw:flex tw:flex-col tw:gap-2">
        <div
          class="tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover/30 tw:p-3 tw:flex tw:flex-col tw:gap-1"
        >
          <div class="tw:font-semibold tw:text-on-main">{{ preview.name }}</div>
          <div v-if="preview.description" class="tw:text-xs tw:text-secondary">
            {{ preview.description }}
          </div>
          <div class="tw:text-caption tw:text-secondary tw:mt-1">
            {{ stepCount }} step{{ stepCount === 1 ? '' : 's' }} · created as a
            <strong>draft</strong> for your review
          </div>
        </div>

        <div
          v-if="stepsWithoutRoles"
          class="tw:rounded-lg tw:border tw:border-amber-300 tw:bg-amber-50 tw:p-3 tw:text-xs tw:text-amber-900 tw:flex tw:items-start tw:gap-2"
        >
          <IconAlertTriangle :size="16" class="tw:shrink-0 tw:mt-0.5" />
          <span>
            {{ stepsWithoutRoles }} step{{ stepsWithoutRoles === 1 ? ' has' : 's have' }} no
            matching role — assign roles in the builder before publishing.
          </span>
        </div>

        <div class="tw:max-h-80 tw:overflow-y-auto tw:flex tw:flex-col tw:gap-2">
          <div
            v-for="step in previewSteps"
            :key="step.order"
            class="tw:rounded-lg tw:border tw:border-divider tw:p-3 tw:flex tw:flex-col tw:gap-1.5"
          >
            <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
              <span
                class="tw:shrink-0 tw:w-6 tw:h-6 tw:rounded-full tw:bg-main-hover tw:text-xs tw:font-semibold tw:flex tw:items-center tw:justify-center"
              >
                {{ step.order }}
              </span>
              <span class="tw:font-medium tw:text-on-main tw:flex-1 tw:min-w-0 tw:truncate">
                {{ step.name }}
              </span>
              <span
                class="tw:shrink-0 tw:text-micro tw:uppercase tw:tracking-wide tw:text-secondary tw:bg-main-hover tw:rounded tw:px-1.5 tw:py-0.5"
              >
                {{
                  step.stepType === 'APPROVAL'
                    ? 'Approval'
                    : step.stepType === 'DELAY'
                      ? 'Delay Action'
                      : 'Action'
                }}
              </span>
            </div>

            <div v-if="step.description" class="tw:text-xs tw:text-secondary tw:pl-8">
              {{ step.description }}
            </div>

            <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:pl-8">
              <RoleBadgeById v-for="rid in step.validRoleIds" :key="rid" :roleId="rid" />
              <span
                v-if="step.missingRoles"
                class="tw:text-xs tw:text-amber-700 tw:flex tw:items-center tw:gap-1"
              >
                <IconAlertTriangle :size="13" /> No matching role
              </span>
            </div>

            <div
              class="tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:pl-8 tw:text-caption tw:text-secondary"
            >
              <span>{{ ruleLabel(step) }}</span>
              <span
                v-if="step.stepType === 'DELAY' && step.delayDays"
                class="tw:flex tw:items-center tw:gap-1"
              >
                <IconClock :size="13" /> Waits {{ step.delayDays }}d before assigning
              </span>
              <span v-if="step.slaDays" class="tw:flex tw:items-center tw:gap-1">
                <IconClock :size="13" /> {{ step.slaDays }}d SLA
              </span>
              <span v-if="step.requireEsignature" class="tw:flex tw:items-center tw:gap-1">
                <IconSignature :size="13" /> E-signature
              </span>
              <span v-if="step.requireComments" class="tw:flex tw:items-center tw:gap-1">
                <IconMessage :size="13" /> Comments required
              </span>
              <span v-if="step.fieldCount" class="tw:flex tw:items-center tw:gap-1">
                <IconForms :size="13" /> {{ step.fieldCount }} form field{{ step.fieldCount === 1 ? '' : 's' }}
              </span>
            </div>

            <div v-if="step.rationale" class="tw:text-caption tw:text-secondary tw:italic tw:pl-8">
              {{ step.rationale }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" @click="close">Cancel</BaseButton>
      <BaseButton v-if="preview" variant="primary" :loading="creating" :disabled="creating" @click="createAsDraft">
        <template #icon><IconSparkles :size="16" /></template>
        Create as Draft ({{ stepCount }} step{{ stepCount === 1 ? '' : 's' }})
      </BaseButton>
    </template>
  </BaseDialog>
</template>
