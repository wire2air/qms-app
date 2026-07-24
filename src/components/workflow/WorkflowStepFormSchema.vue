<script setup>
import { IconForms, IconPlus, IconPencil } from '@tabler/icons-vue'
import WorkflowStepFormBuilderPanel from './WorkflowStepFormBuilderPanel.vue'
import WorkflowTaskFormTemplatePicker from './WorkflowTaskFormTemplatePicker.vue'

const props = defineProps({
  stepId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
})

const step = useLiveQueryWithDeps(
  [() => props.stepId],
  async (db, [stepId]) => {
    if (!stepId) return null
    return await db.WorkflowStep.findByPk(stepId)
  },
  { models: ['WorkflowStep'] },
)

const hasSchema = computed(() => (step.value?.formSchema?.length ?? 0) > 0)

const fieldCountLabel = computed(() => {
  const count = step.value?.formSchema?.length ?? 0
  return count === 1 ? '1 field' : `${count} fields`
})

const previewFieldNames = computed(() => {
  const fields = step.value?.formSchema ?? []
  return fields
    .slice(0, 3)
    .map((f) => f.label ?? f.id ?? 'Untitled')
    .filter(Boolean)
})

const builderOpen = ref(false)
const pickerOpen = ref(false)
// Schema chosen in the template picker — seeds the builder for a NEW form.
// null = editing the step's existing form.
const seedSchema = ref(null)

function openCreate() {
  pickerOpen.value = true
}

// Picker choice (blank = [] / preset / saved template) → open the builder
// seeded with it. Nothing persists until the builder's Save.
function handleTemplatePicked(schema) {
  seedSchema.value = schema
  builderOpen.value = true
}

function openEdit() {
  seedSchema.value = null
  builderOpen.value = true
}

async function handleSave(schema) {
  if (!step.value || !props.canUpdate) return
  step.value.formSchema = schema
  await step.value.save()
}
</script>

<template>
  <div class="tw:space-y-4">
    <!-- Section Header -->
    <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary">
      <IconForms :size="22" />
      <h2 class="tw:text-lg tw:font-semibold tw:text-on-main">Task Form</h2>
      <HelpButton slug="KB/automation/task-forms-and-form-blocks" :size="16" />
    </div>
    <p class="tw:text-xs tw:text-secondary">
      The form the assignee fills in to complete this step — what they did, found, or decided.
    </p>

    <!-- Empty state -->
    <div
      v-if="!hasSchema"
      class="tw:border tw:border-dashed tw:border-divider tw:rounded-xl tw:p-6 tw:flex tw:flex-col tw:items-center tw:gap-4 tw:text-center"
    >
      <IconForms :size="40" class="tw:text-secondary tw:opacity-40" />
      <div>
        <p class="tw:font-semibold tw:text-on-main tw:text-sm">No task form yet</p>
        <p class="tw:text-xs tw:text-secondary tw:mt-1">
          Start from scratch or copy fields from an existing form template.
        </p>
      </div>
      <BaseButton variant="secondary" size="sm" :disabled="!canUpdate" @click="openCreate">
        <template #icon>
          <IconPlus :size="14" />
        </template>
        Create Task Form
      </BaseButton>
    </div>

    <!-- Has schema -->
    <div v-else class="tw:border tw:border-divider tw:rounded-xl tw:overflow-hidden">
      <!-- Header row -->
      <div class="tw:flex tw:items-center tw:gap-4 tw:p-4 tw:border-b tw:border-divider">
        <div class="tw:flex-1 tw:flex tw:flex-col tw:gap-1 tw:min-w-0">
          <div class="tw:flex tw:items-center tw:gap-2">
            <span
              class="tw:inline-flex tw:items-center tw:px-2 tw:py-0.5 tw:rounded-full tw:text-xs tw:font-semibold tw:bg-primary/10 tw:text-primary"
            >
              {{ fieldCountLabel }}
            </span>
          </div>
          <p v-if="previewFieldNames.length > 0" class="tw:text-xs tw:text-secondary tw:truncate">
            {{ previewFieldNames.join(', ') }}{{ (step?.formSchema?.length ?? 0) > 3 ? ', …' : '' }}
          </p>
        </div>
        <BaseButton variant="secondary" size="sm" :disabled="!canUpdate" @click="openEdit">
          <template #icon>
            <IconPencil :size="14" />
          </template>
          Edit Form
        </BaseButton>
      </div>

      <!-- Form preview -->
      <div class="tw:p-6 tw:bg-main-hover/30">
        <BaseText variant="overline" class="tw:block tw:mb-4">Preview</BaseText>
        <DynamicForm :fields="step.formSchema" :modelValue="{}" readonly />
      </div>
    </div>
  </div>

  <!-- Card-style starting-point picker (Blank / QMS presets / saved templates) -->
  <WorkflowTaskFormTemplatePicker v-model="pickerOpen" @select="handleTemplatePicked" />

  <WorkflowStepFormBuilderPanel
    v-model="builderOpen"
    :initialSchema="seedSchema ?? step?.formSchema ?? []"
    builderTitle="Task Form"
    @save="handleSave"
  />
</template>
