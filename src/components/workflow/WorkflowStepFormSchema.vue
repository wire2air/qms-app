<script setup>
import { IconForms, IconLayoutBoard, IconArrowsMaximize } from '@tabler/icons-vue'
import { useDebounceFn } from '@vueuse/core'
import WorkflowStepFormBuilderPanel from './WorkflowStepFormBuilderPanel.vue'
import WorkflowTaskFormTemplatePicker from './WorkflowTaskFormTemplatePicker.vue'
import MiniFormBuilder from '@/components/form-builder/MiniFormBuilder.vue'

const props = defineProps({
  stepId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
  // Hide the title row + blurb + the "Start from a block" / "Full builder"
  // buttons (user request 2026-08-15). In the workflow builder the step panel
  // shows nothing BUT this form, so the heading restated the obvious and the
  // two entry points added noise. Kept behind a flag rather than deleted —
  // the block picker and full builder are still wanted, just not here yet.
  hideHeader: { type: Boolean, default: false },
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

// ── Inline mini builder (user request 2026-08-14) ────────────────────────────
// The canvas renders right here — no full-screen trip for "a couple of text
// fields". Edits autosave (debounced, matching the step editor's cadence).
// `builderSession` re-mounts the mini builder to re-seed it after an EXTERNAL
// schema change (block picker / full-builder save); its own edits must NOT
// re-mount it, or the canvas would reset mid-drag on every autosave.
const builderSession = ref(0)

const debouncedSchemaSave = useDebounceFn(async (schema) => {
  if (!step.value || !props.canUpdate) return
  step.value.formSchema = JSON.parse(JSON.stringify(schema))
  await step.value.save()
}, 800)

function onSchemaChange(schema) {
  debouncedSchemaSave(schema)
}

// Re-seed when switching steps.
watch(
  () => props.stepId,
  () => {
    builderSession.value++
  },
)

// ── Secondary paths: block picker + full builder ─────────────────────────────
const builderOpen = ref(false)
const pickerOpen = ref(false)

// Block/preset pick seeds the schema DIRECTLY (it used to detour through the
// full builder) — saved immediately, then the mini builder re-seeds.
async function handleTemplatePicked(schema) {
  if (!step.value || !props.canUpdate) return
  step.value.formSchema = schema
  await step.value.save()
  builderSession.value++
}

function openFullBuilder() {
  builderOpen.value = true
}

async function handleFullBuilderSave(schema) {
  if (!step.value || !props.canUpdate) return
  step.value.formSchema = schema
  await step.value.save()
  builderSession.value++
}
</script>

<template>
  <div class="tw:space-y-4">
    <!-- Section Header (hidden in the workflow builder — see hideHeader) -->
    <div v-if="!hideHeader" class="tw:flex tw:items-center tw:gap-2 tw:text-secondary">
      <IconForms :size="22" />
      <h2 class="tw:text-lg tw:font-semibold tw:text-on-main">Task Form</h2>
      <HelpButton slug="KB/automation/task-forms-and-form-blocks" :size="16" />
      <div v-if="canUpdate" class="tw:ml-auto tw:flex tw:items-center tw:gap-2">
        <BaseButton variant="outline" size="sm" @click="pickerOpen = true">
          <template #icon><IconLayoutBoard :size="14" /></template>
          Start from a block
        </BaseButton>
        <BaseButton variant="outline" size="sm" @click="openFullBuilder">
          <template #icon><IconArrowsMaximize :size="14" /></template>
          Full builder
        </BaseButton>
      </div>
    </div>
    <p v-if="!hideHeader" class="tw:text-xs tw:text-secondary">
      The form the assignee fills in to complete this step — what they did, found, or decided.
      <template v-if="canUpdate">
        Add and arrange fields right here; drag to reorder, click a field to configure it.
      </template>
    </p>

    <!-- Editable: the inline mini builder (canvas + Add field). -->
    <MiniFormBuilder
      v-if="canUpdate && step"
      :key="`${stepId}:${builderSession}`"
      :initialSchema="step.formSchema ?? []"
      @update:schema="onSchemaChange"
    />

    <!-- Read-only: plain preview of the form -->
    <template v-else-if="step">
      <div v-if="!hasSchema" class="tw:text-sm tw:text-secondary tw:italic">
        No task form configured for this step.
      </div>
      <div v-else class="tw:border tw:border-divider tw:rounded-xl tw:p-6 tw:bg-main-hover/30">
        <DynamicForm :fields="step.formSchema" :modelValue="{}" readonly />
      </div>
    </template>
  </div>

  <!-- Card-style starting-point picker (Blank / QMS presets / saved blocks).
       A pick replaces the step's current form. -->
  <WorkflowTaskFormTemplatePicker v-model="pickerOpen" @select="handleTemplatePicked" />

  <!-- Full builder — for heavy editing (AI assistant, preview, JSON, undo). -->
  <WorkflowStepFormBuilderPanel
    v-model="builderOpen"
    :initialSchema="step?.formSchema ?? []"
    builderTitle="Task Form"
    @save="handleFullBuilderSave"
  />
</template>
