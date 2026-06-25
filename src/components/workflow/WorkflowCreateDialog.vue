<script setup>
import { IconLayoutKanban } from '@tabler/icons-vue'
import { required } from '@shared/components/form/validators.js'
import { currentCompany } from '@/utils/currentCompany.js'

const emit = defineEmits(['created'])

const show = defineModel({ type: Boolean, default: false })

const formRef = ref(null)
const isSubmitting = ref(false)
const saveError = ref('')

const form = ref({
  name: '',
  description: '',
  moduleId: null,
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

async function onSubmit() {
  if (isSubmitting.value) return
  isSubmitting.value = true
  saveError.value = ''
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
  } catch (err) {
    saveError.value = err?.message || 'Failed to create workflow'
  } finally {
    isSubmitting.value = false
  }
}

function resetForm() {
  form.value = { name: '', description: '', moduleId: null }
}

// Reset form and error when dialog closes
watch(show, (val) => {
  if (!val) {
    resetForm()
    saveError.value = ''
  }
})
</script>

<template>
  <BaseDialog v-model="show" maxWidth="md">
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

    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <p class="tw:text-sm tw:text-secondary tw:leading-relaxed">Define a new workflow.</p>

      <BaseField
        label="Workflow Name"
        required
        :value="form.name"
        :rules="[required('Workflow name is required')]"
      >
        <template #default="field">
          <BaseTextInput
            v-bind="field"
            v-model="form.name"
            placeholder="e.g. Global SOP Multi-Stage Workflow"
            autofocus
          />
        </template>
      </BaseField>

      <BaseField label="Module" required :value="form.moduleId" :rules="[required()]">
        <ModuleSelectMenu v-model="form.moduleId" :required="true" />
      </BaseField>

      <BaseTextarea
        v-model="form.description"
        label="Description"
        placeholder="Describe the purpose of this workflow"
      />
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Create Workflow"
        :loading="isSubmitting"
        :error="saveError"
        @cancel="show = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
