<script setup>
import { IconLayoutKanban } from '@tabler/icons-vue'
import { required, helpers } from '@vuelidate/validators'
import { useValidator } from '@shared/composables/validator.js'
import { currentCompany } from '@/utils/currentCompany.js'

const emit = defineEmits(['created'])

const show = defineModel({ type: Boolean, default: false })

const form = ref({
  name: '',
  description: '',
  moduleId: null,
})

const rules = computed(() => ({
  name: { required: helpers.withMessage('Workflow name is required', required) },
}))

const validator = useValidator(rules, form)

const loading = ref(false)

const isFormValid = computed(() => {
  return form.value.name.trim() && form.value.moduleId
})

// Create the workflow, its first draft version, and a seeded "Step 1" all in
// one transactional flow. Doing the first-step creation here (instead of an
// auto-add watcher in WorkflowStepList) avoids the empty-array re-fire race
// where two "Step 1"s could be created concurrently.
const createWorkflowAndVersion = useLiveMutation(async (db, { name, description, moduleId }) => {
  const workflow = db.Workflow.create({
    name,
    description,
    moduleId,
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

  const settings = currentCompany.value?.settings || {}
  // formSchema starts empty — see WorkflowStepList.createStep for the
  // rationale (the prior auto-seed silently added a form to every new
  // step, including APPROVAL steps). Authors add a schema explicitly
  // via the Form tab on the step editor.
  const step = db.WorkflowStep.create({
    workflowVersionId: version.id,
    name: 'Step 1',
    description: '',
    stepOrder: 1,
    approvalRule: settings.defaultWorkflowApprovalRule ?? 'ALL',
    slaDays: settings.defaultSla ?? null,
    requireComments: settings.defaultWorkflowRequireComment ?? false,
    requireEsignature: settings.defaultWorkflowRequireSignature ?? false,
    formSchema: [],
  })
  await step.save()

  // Seed every allowed outcome on the new step (mirrors the per-step seeding
  // that WorkflowStepList.createStep does when steps are added later).
  const outcomes = await db.WorkflowStepOutcome.where().exec()
  for (const o of outcomes) {
    const record = db.AllowedOutcomeOnStep.create({ stepId: step.id, outcomeId: o.id })
    await record.save()
  }

  return workflow
})

async function handleSubmit() {
  const valid = await validator.value.$validate()
  if (!valid || !isFormValid.value) return

  loading.value = true
  try {
    const workflow = await createWorkflowAndVersion({
      name: form.value.name.trim(),
      description: form.value.description.trim() || '',
      moduleId: form.value.moduleId,
    })
    if (workflow) {
      emit('created', workflow)
      resetForm()
      show.value = false
    }
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.value = { name: '', description: '', moduleId: null, documentTypeId: null }
}
</script>

<template>
  <BaseDialog v-model="show" title="Create Workflow" maxWidth="md" @hide="resetForm">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-9 tw:h-9 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconLayoutKanban :size="20" />
        </div>
        <span>Create Workflow</span>
      </div>
    </template>

    <div class="tw:flex tw:flex-col tw:gap-4">
      <p class="tw:text-sm tw:text-secondary tw:leading-relaxed">Define a new workflow.</p>

      <div class="tw:flex tw:flex-col tw:gap-4">
        <!-- Name -->
        <div data-testid="workflow-name">
          <BaseTextInput
            v-model="form.name"
            name="name"
            label="Workflow Name"
            placeholder="e.g. Global SOP Multi-Stage Workflow"
            autofocus
            required
          />
        </div>

        <div class="tw:grid tw:grid-cols-2 tw:gap-4">
          <!-- Module -->
          <div data-testid="workflow-module-select">
            <label class="tw:block tw:text-xs tw:font-semibold tw:text-secondary tw:mb-1.5">
              Module <span class="tw:text-bad">*</span>
            </label>
            <ModuleSelectMenu v-model="form.moduleId" required />
          </div>
        </div>

        <!-- Description -->
        <div data-testid="workflow-description">
          <BaseTextarea
            v-model="form.description"
            label="Description"
            placeholder="Describe the purpose of this workflow"
          />
        </div>
      </div>
    </div>

    <template #footer="{ close }">
      <BaseButton variant="outline" @click="close">Cancel</BaseButton>
      <BaseButton
        data-testid="workflow-create-submit"
        :isLoading="loading"
        :disabled="!isFormValid"
        @click="handleSubmit"
      >
        Create Workflow
      </BaseButton>
    </template>
  </BaseDialog>
</template>
