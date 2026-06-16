<script setup>
import { IconForms, IconPlus, IconCopy, IconPencil } from '@tabler/icons-vue'
import WorkflowStepFormBuilderPanel from './WorkflowStepFormBuilderPanel.vue'

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
const startAtSelect = ref(false)

function openBlank() {
  startAtSelect.value = false
  builderOpen.value = true
}

function openFromTemplate() {
  startAtSelect.value = true
  builderOpen.value = true
}

function openEdit() {
  startAtSelect.value = false
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
      <h2 class="tw:text-lg tw:font-bold tw:text-on-main">Form Schema</h2>
    </div>
    <p class="tw:text-xs tw:text-secondary">
      Define the data fields that assignees must fill in when completing this step.
    </p>

    <!-- Empty state -->
    <div
      v-if="!hasSchema"
      class="tw:border tw:border-dashed tw:border-divider tw:rounded-xl tw:p-6 tw:flex tw:flex-col tw:items-center tw:gap-4 tw:text-center"
    >
      <IconForms :size="40" class="tw:text-secondary tw:opacity-40" />
      <div>
        <p class="tw:font-semibold tw:text-on-main tw:text-sm">No form schema yet</p>
        <p class="tw:text-xs tw:text-secondary tw:mt-1">
          Start from scratch or copy fields from an existing form template.
        </p>
      </div>
      <div class="tw:flex tw:gap-2">
        <BaseButton variant="secondary" size="sm" :disabled="!canUpdate" @click="openBlank">
          <template #icon>
            <IconPlus :size="14" />
          </template>
          Start Blank
        </BaseButton>
        <BaseButton variant="outline" size="sm" :disabled="!canUpdate" @click="openFromTemplate">
          <template #icon>
            <IconCopy :size="14" />
          </template>
          Use Template
        </BaseButton>
      </div>
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
          Edit Schema
        </BaseButton>
      </div>

      <!-- Form preview -->
      <div class="tw:p-6 tw:bg-main-hover/30">
        <p
          class="tw:text-[10px] tw:font-bold tw:uppercase tw:text-secondary tw:mb-4 tw:tracking-wide"
        >
          Preview
        </p>
        <DynamicForm :fields="step.formSchema" :modelValue="{}" readonly />
      </div>
    </div>
  </div>

  <WorkflowStepFormBuilderPanel
    v-model="builderOpen"
    :initialSchema="step?.formSchema ?? []"
    :startAtSelect="startAtSelect"
    @save="handleSave"
  />
</template>
