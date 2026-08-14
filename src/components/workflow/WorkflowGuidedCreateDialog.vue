<script setup>
/**
 * Guided, wizard-style workflow creation. Replaces the bare name/module dialog
 * with a 4-step flow that asks plain-language questions and builds the right
 * step structure from the answers:
 *
 *   1. Basics      — name, module, description.
 *   2. Structure   — "one person does everything" vs "break it into stages"
 *                    (stage names + optional roles).
 *   3. Reviews     — final approval sign-off? (+ e-signature) and a follow-up
 *                    effectiveness check? (delay window).
 *   4. Review      — the resulting step list, then Create as Draft.
 *
 * Every working (ACTION) stage gets the STANDARD task form — description +
 * attachments — mirroring the seeded TASK_ACTION_SCHEMA, so users don't have
 * to design a form to get a working workflow. Power users can still refine
 * everything in the full builder afterwards (the wizard lands on the draft).
 */
import {
  IconUser,
  IconListNumbers,
  IconSignature,
  IconClock,
  IconInfoCircle,
} from '@tabler/icons-vue'
import { currentCompany } from '@/utils/currentCompany.js'
import { DELAY_PRESETS } from '@/components/workflow/delayPresets.js'

const emit = defineEmits(['created'])
const show = defineModel({ type: Boolean, default: false })

// Mirror of WORKFLOW_MODULES_WITH_STEP_CONFIG — only these modules render
// per-step data-capture forms, so only they get the standard task form.
const MODULES_WITH_STEP_FORMS = [
  'NON_CONFORMANCE',
  'CAPA',
  'CHANGE_CONTROL',
  'CUSTOMER_COMPLAINT',
  'COMPLAINT',
]

// The standard task form seeded on every working stage — mirrors the backend
// seed TASK_ACTION_SCHEMA (bootstrapCompanyDefaults): a rich-text "what was
// done" plus attachments. Deliberately minimal; domain fields live on the
// record itself, and specialized forms are edited later in the builder.
const STANDARD_TASK_FORM = [
  {
    name: 'description',
    label: 'Description',
    type: 'textEditor',
    required: true,
    placeholder: 'Describe what was done…',
  },
  { name: 'attachments', label: 'Attachments', type: 'file', required: false, multiple: true },
]

const STEPS = [
  { title: 'Basics', description: 'Name it' },
  { title: 'Structure', description: 'Who does the work' },
  { title: 'Reviews & checks', description: 'Sign-offs' },
  { title: 'Review', description: 'Create draft' },
]

const step = ref(0)

// ── Answers ──────────────────────────────────────────────────────────────────
const name = ref('')
const moduleId = ref(null)
const description = ref('')

// Structure: single-owner vs staged.
const structureMode = ref('single') // 'single' | 'stages'
const singleRoleIds = ref([])
const stages = ref([
  { name: 'Investigation', roleIds: [] },
  { name: 'Implementation', roleIds: [] },
])

// Reviews & checks.
const needApproval = ref(true)
const approvalEsign = ref(false)
const approvalRoleIds = ref([])
const needCheck = ref(false)
const checkDays = ref(90)
const checkRoleIds = ref([])

const creating = ref(false)
const error = ref('')

watch(show, (open) => {
  if (!open) return
  step.value = 0
  name.value = ''
  moduleId.value = null
  description.value = ''
  structureMode.value = 'single'
  singleRoleIds.value = []
  stages.value = [
    { name: 'Investigation', roleIds: [] },
    { name: 'Implementation', roleIds: [] },
  ]
  needApproval.value = true
  approvalEsign.value = false
  approvalRoleIds.value = []
  needCheck.value = false
  checkDays.value = 90
  checkRoleIds.value = []
  error.value = ''
})

function close() {
  show.value = false
}

// ── Navigation gates ─────────────────────────────────────────────────────────
const canNext = computed(() => {
  if (step.value === 0) return !!name.value.trim() && !!moduleId.value
  if (step.value === 1) {
    if (structureMode.value === 'single') return true
    return stages.value.length > 0 && stages.value.every((s) => s.name.trim())
  }
  return true
})

function next() {
  if (!canNext.value) return
  step.value = Math.min(step.value + 1, STEPS.length - 1)
}
function back() {
  step.value = Math.max(step.value - 1, 0)
}

function addStage() {
  stages.value.push({ name: '', roleIds: [] })
}
function removeStage(i) {
  stages.value.splice(i, 1)
}

// ── Resulting step plan (drives the review screen AND the create) ────────────
const supportsStepForms = computed(() => MODULES_WITH_STEP_FORMS.includes(moduleId.value))

const plannedSteps = computed(() => {
  const out = []
  if (structureMode.value === 'single') {
    out.push({
      name: 'Complete Task',
      stepType: 'ACTION',
      roleIds: singleRoleIds.value,
      hasForm: supportsStepForms.value,
      note: 'One person completes the whole task using the standard task form.',
    })
  } else {
    for (const s of stages.value) {
      out.push({
        name: s.name.trim(),
        stepType: 'ACTION',
        roleIds: s.roleIds,
        hasForm: supportsStepForms.value,
        note: 'Standard task form — description + attachments.',
      })
    }
  }
  if (needApproval.value) {
    out.push({
      name: 'Final Approval',
      stepType: 'APPROVAL',
      roleIds: approvalRoleIds.value,
      hasForm: false,
      esign: approvalEsign.value,
      note: approvalEsign.value
        ? 'Sign-off with e-signature — comment only, no form.'
        : 'Sign-off — comment only, no form.',
    })
  }
  if (needCheck.value) {
    out.push({
      name: 'Effectiveness Check',
      stepType: 'DELAY',
      roleIds: checkRoleIds.value,
      hasForm: supportsStepForms.value,
      delayDays: checkDays.value,
      note: `Waits ${checkDays.value} days after the previous step, then assigns its task. The owner can reschedule or skip it at runtime.`,
    })
  }
  return out
})

// ── Create as Draft ──────────────────────────────────────────────────────────
const createDraft = useLiveMutation(async (db) => {
  const settings = currentCompany.value?.settings || {}

  const workflow = db.Workflow.create({
    name: name.value.trim(),
    description: description.value.trim() || '',
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

  let order = 1
  for (const p of plannedSteps.value) {
    const stepRecord = db.WorkflowStep.create({
      workflowVersionId: version.id,
      name: p.name,
      description: '',
      stepOrder: order++,
      stepType: p.stepType,
      approvalRule: settings.defaultWorkflowApprovalRule ?? 'ALL',
      slaDays: settings.defaultSla ?? null,
      delayDays: p.stepType === 'DELAY' ? (p.delayDays ?? null) : null,
      maxDelayExtensions: p.stepType === 'DELAY' ? 1 : null,
      requireComments: settings.defaultWorkflowRequireComment ?? false,
      requireEsignature: p.esign ?? settings.defaultWorkflowRequireSignature ?? false,
      formSchema: p.hasForm ? JSON.parse(JSON.stringify(STANDARD_TASK_FORM)) : [],
    })
    await stepRecord.save()

    for (const roleId of p.roleIds ?? []) {
      const sr = db.WorkflowStepRole.create({ stepId: stepRecord.id, roleId })
      await sr.save()
    }
    for (const o of outcomes) {
      const rec = db.AllowedOutcomeOnStep.create({ stepId: stepRecord.id, outcomeId: o.id })
      await rec.save()
    }
  }

  return workflow
})

async function handleCreate() {
  if (creating.value) return
  creating.value = true
  error.value = ''
  try {
    const workflow = await createDraft()
    if (workflow) {
      emit('created', workflow)
      close()
    }
  } catch (err) {
    error.value = err?.message || 'Failed to create the workflow'
  } finally {
    creating.value = false
  }
}

function typeLabel(p) {
  if (p.stepType === 'APPROVAL') return 'Approval'
  if (p.stepType === 'DELAY') return 'Schedule Task'
  return 'Action'
}
</script>

<template>
  <BaseDialog :modelValue="show" title="Create Workflow" maxWidth="3xl" @update:modelValue="close">
    <div class="tw:flex tw:flex-col tw:gap-5 tw:p-1">
      <BaseStepper v-model="step" :steps="STEPS" ariaLabel="Workflow setup progress" />

      <!-- ── 1. Basics ─────────────────────────────────────────────────── -->
      <template v-if="step === 0">
        <div class="tw:flex tw:flex-col tw:gap-4">
          <BaseField v-slot="{ id: fieldId }" label="Workflow name" required>
            <BaseTextInput
              :id="fieldId"
              v-model="name"
              placeholder="e.g. Default CAPA Workflow"
              autofocus
            />
          </BaseField>
          <BaseField label="Module" required>
            <ModuleSelectMenu v-model="moduleId" :required="true" />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Description" optional>
            <BaseTextarea
              :id="fieldId"
              v-model="description"
              :rows="2"
              placeholder="When should this workflow be used?"
            />
          </BaseField>
        </div>
      </template>

      <!-- ── 2. Structure ──────────────────────────────────────────────── -->
      <template v-else-if="step === 1">
        <div class="tw:flex tw:flex-col tw:gap-4">
          <p class="tw:text-sm tw:text-on-main">How is the work done?</p>
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <label
              class="tw:relative tw:flex tw:flex-col tw:p-4 tw:border tw:rounded-xl tw:cursor-pointer tw:transition-all"
              :class="
                structureMode === 'single'
                  ? 'tw:border-primary tw:bg-primary/5 tw:ring-1 tw:ring-primary/20'
                  : 'tw:border-divider tw:hover:bg-main-hover'
              "
            >
              <input v-model="structureMode" type="radio" value="single" class="tw:sr-only" />
              <span
class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-semibold tw:mb-1"
                :class="structureMode === 'single' ? 'tw:text-primary' : 'tw:text-on-main'"
              >
                <IconUser :size="16" /> One person does everything
              </span>
              <span class="tw:text-micro tw:leading-snug tw:text-secondary">
                A single working step. The assignee completes the whole task in one standard form.
                Simplest — great for most processes.
              </span>
            </label>
            <label
              class="tw:relative tw:flex tw:flex-col tw:p-4 tw:border tw:rounded-xl tw:cursor-pointer tw:transition-all"
              :class="
                structureMode === 'stages'
                  ? 'tw:border-primary tw:bg-primary/5 tw:ring-1 tw:ring-primary/20'
                  : 'tw:border-divider tw:hover:bg-main-hover'
              "
            >
              <input v-model="structureMode" type="radio" value="stages" class="tw:sr-only" />
              <span
class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-semibold tw:mb-1"
                :class="structureMode === 'stages' ? 'tw:text-primary' : 'tw:text-on-main'"
              >
                <IconListNumbers :size="16" /> Break it into stages
              </span>
              <span class="tw:text-micro tw:leading-snug tw:text-secondary">
                Several working steps done in order, each possibly by different people
                (e.g. Investigation → Action Plan → Implementation).
              </span>
            </label>
          </div>

          <!-- Single: who does it -->
          <BaseField v-if="structureMode === 'single'" label="Who does the work?" optional>
            <RoleSelectMenu v-model="singleRoleIds" multiple />
            <p class="tw:text-micro tw:text-secondary tw:mt-1">
              Optional — leave empty and the submitter picks the person each time.
            </p>
          </BaseField>

          <!-- Stages: name each stage -->
          <div v-else class="tw:flex tw:flex-col tw:gap-2">
            <p class="tw:text-micro tw:text-secondary">
              Name each stage in order. Roles are optional — the submitter can pick people at
              run time.
            </p>
            <div
              v-for="(s, i) in stages"
              :key="i"
              class="tw:flex tw:items-center tw:gap-2"
            >
              <span class="tw:shrink-0 tw:w-6 tw:h-6 tw:rounded-full tw:bg-main-hover tw:text-xs tw:font-semibold tw:flex tw:items-center tw:justify-center">
                {{ i + 1 }}
              </span>
              <BaseTextInput
                v-model="s.name"
                class="tw:flex-1"
                :placeholder="`Stage ${i + 1} name — e.g. Investigation`"
              />
              <RoleSelectMenu v-model="s.roleIds" multiple class="tw:w-56" />
              <BaseButton
                v-if="stages.length > 1"
                variant="ghost"
                aria-label="Remove stage"
                @click="removeStage(i)"
                >✕</BaseButton
              >
            </div>
            <BaseButton variant="outline" class="tw:self-start" @click="addStage">
              + Add stage
            </BaseButton>
          </div>
        </div>
      </template>

      <!-- ── 3. Reviews & checks ───────────────────────────────────────── -->
      <template v-else-if="step === 2">
        <div class="tw:flex tw:flex-col tw:gap-4">
          <!-- Approval -->
          <div class="tw:rounded-xl tw:border tw:border-divider tw:p-4 tw:flex tw:flex-col tw:gap-3">
            <label class="tw:flex tw:items-center tw:justify-between tw:cursor-pointer">
              <span class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-semibold tw:text-on-main">
                <IconSignature :size="16" /> Need a final approval?
              </span>
              <BaseSwitch v-model="needApproval" />
            </label>
            <p class="tw:text-micro tw:text-secondary">
              Adds a sign-off step at the end — an approver reviews the completed work and
              approves or rejects it. Recommended for most controlled processes.
            </p>
            <template v-if="needApproval">
              <BaseField label="Who approves?" optional>
                <RoleSelectMenu v-model="approvalRoleIds" multiple />
              </BaseField>
              <label class="tw:flex tw:items-center tw:gap-3 tw:cursor-pointer">
                <BaseSwitch v-model="approvalEsign" />
                <span class="tw:text-xs tw:font-medium tw:text-on-main">
                  Require e-signature (regulated sign-off)
                </span>
              </label>
            </template>
          </div>

          <!-- Effectiveness check -->
          <div class="tw:rounded-xl tw:border tw:border-divider tw:p-4 tw:flex tw:flex-col tw:gap-3">
            <label class="tw:flex tw:items-center tw:justify-between tw:cursor-pointer">
              <span class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-semibold tw:text-on-main">
                <IconClock :size="16" /> Want to add a follow-up Schedule Task?
              </span>
              <BaseSwitch v-model="needCheck" />
            </label>
            <p class="tw:text-micro tw:text-secondary">
              Adds a scheduled step that waits a set time after the work completes, then assigns
              its task — e.g. an Effectiveness check to verify the fix actually worked. The record
              owner can reschedule or skip it on each record.
            </p>
            <template v-if="needCheck">
              <BaseField label="Check after">
                <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                  <button
                    v-for="preset in DELAY_PRESETS"
                    :key="preset.days"
                    type="button"
                    class="tw:px-3 tw:py-1 tw:rounded-full tw:text-xs tw:font-medium tw:border tw:transition-colors"
                    :class="
                      checkDays === preset.days
                        ? 'tw:bg-primary tw:text-white tw:border-primary'
                        : 'tw:bg-white tw:text-secondary tw:border-divider tw:hover:bg-main-hover'
                    "
                    @click="checkDays = preset.days"
                  >
                    {{ preset.label }}
                  </button>
                </div>
              </BaseField>
              <BaseField label="Who verifies?" optional>
                <RoleSelectMenu v-model="checkRoleIds" multiple />
              </BaseField>
            </template>
          </div>
        </div>
      </template>

      <!-- ── 4. Review & create ────────────────────────────────────────── -->
      <template v-else>
        <div class="tw:flex tw:flex-col tw:gap-3">
          <div class="tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover/30 tw:p-3">
            <div class="tw:font-semibold tw:text-on-main">{{ name }}</div>
            <div v-if="description" class="tw:text-xs tw:text-secondary">{{ description }}</div>
            <div class="tw:text-caption tw:text-secondary tw:mt-1">
              {{ plannedSteps.length }} step{{ plannedSteps.length === 1 ? '' : 's' }} · created as
              a <strong>draft</strong> you can refine in the builder
            </div>
          </div>

          <div
            v-for="(p, i) in plannedSteps"
            :key="i"
            class="tw:rounded-lg tw:border tw:border-divider tw:p-3 tw:flex tw:flex-col tw:gap-1"
          >
            <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
              <span class="tw:shrink-0 tw:w-6 tw:h-6 tw:rounded-full tw:bg-main-hover tw:text-xs tw:font-semibold tw:flex tw:items-center tw:justify-center">
                {{ i + 1 }}
              </span>
              <span class="tw:font-medium tw:text-on-main tw:flex-1">{{ p.name }}</span>
              <span class="tw:shrink-0 tw:text-micro tw:uppercase tw:tracking-wide tw:text-secondary tw:bg-main-hover tw:rounded tw:px-1.5 tw:py-0.5">
                {{ typeLabel(p) }}
              </span>
            </div>
            <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-1.5 tw:pl-8">
              <RoleBadgeById v-for="rid in p.roleIds" :key="rid" :roleId="rid" />
              <span v-if="!p.roleIds?.length" class="tw:text-micro tw:text-secondary">
                Assignee picked at run time
              </span>
            </div>
            <p class="tw:text-micro tw:text-secondary tw:pl-8">{{ p.note }}</p>
          </div>

          <div
            class="tw:rounded-lg tw:bg-blue-50 tw:border tw:border-blue-200 tw:p-3 tw:text-xs tw:text-blue-900 tw:flex tw:items-start tw:gap-2"
          >
            <IconInfoCircle :size="16" class="tw:shrink-0 tw:mt-0.5" />
            <span>
              You can rename steps, change forms, SLAs, and assignees in the builder before
              publishing. Nothing runs until you publish.
            </span>
          </div>

          <div
            v-if="error"
            class="tw:rounded-lg tw:border tw:border-red-300 tw:bg-red-50 tw:p-3 tw:text-xs tw:text-red-800"
          >
            {{ error }}
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <BaseButton variant="outline" @click="close">Cancel</BaseButton>
      <div class="tw:flex-1"></div>
      <BaseButton v-if="step > 0" variant="outline" @click="back">Back</BaseButton>
      <BaseButton v-if="step < STEPS.length - 1" variant="primary" :disabled="!canNext" @click="next">
        Next
      </BaseButton>
      <BaseButton
        v-else
        variant="primary"
        :loading="creating"
        :disabled="creating"
        @click="handleCreate"
      >
        Create as Draft
      </BaseButton>
    </template>
  </BaseDialog>
</template>
