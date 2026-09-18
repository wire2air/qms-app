<script setup>
/**
 * AI-generate a checklist matrix (rows × columns) from a plain-language prompt.
 *
 * Shown from the checklist field on the form-builder canvas. User describes the
 * checklist → POST /v1/services/ai/tasks/checklist.generate_matrix/run → the
 * model returns { title?, rows[], columns[] }. A preview renders the grid; on
 * Apply we emit the raw result and the host (ChecklistBuilderCard) OVERWRITES
 * the field's rows/columns (deriving unique column values).
 *
 * AI-sidecar isolation: this component owns the AI call; the host mounts it
 * behind `v-if="canUseAi"` and reacts to @apply only.
 */
import { IconSparkles, IconAlertTriangle, IconWand } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // Optional context passed to the model (e.g. the parent form's purpose).
  contextHint: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue', 'apply'])

const prompt = ref('')
const generating = ref(false)
const preview = ref(null) // { title?, rows[], columns[] }
const error = ref(null)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    prompt.value = ''
    preview.value = null
    error.value = null
  },
)

function close() {
  emit('update:modelValue', false)
}

const AI_GENERATE_TIMEOUT_MS = 2 * 60_000

async function generate() {
  if (generating.value || !prompt.value.trim()) return
  generating.value = true
  preview.value = null
  error.value = null
  try {
    const res = await post(
      '/v1/services/ai/tasks/checklist.generate_matrix/run',
      { prompt: prompt.value.trim(), context: props.contextHint?.trim() || undefined },
      { timeout: AI_GENERATE_TIMEOUT_MS },
    )
    const out = res?.result
    if (!out?.rows?.length || !out?.columns?.length) {
      error.value = 'The AI didn\'t return a usable grid. Try describing the checklist in more detail.'
      return
    }
    preview.value = out
  } catch (err) {
    error.value = err?.message || 'AI generation failed'
  } finally {
    generating.value = false
  }
}

function apply() {
  if (!preview.value) return
  emit('apply', preview.value)
  close()
}

const columnTypeLabel = {
  radio: 'Radio',
  checkbox: 'Checkbox',
  text: 'Text',
  number: 'Number',
  select: 'Dropdown',
  date: 'Date',
  time: 'Time',
}
</script>

<template>
  <BaseDialog
    :modelValue="modelValue"
    title="Generate checklist with AI"
    maxWidth="2xl"
    @update:modelValue="close"
  >
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <div
        class="tw:rounded-lg tw:bg-purple-50 tw:border tw:border-purple-200 tw:p-3 tw:text-xs tw:text-purple-900 tw:leading-relaxed tw:flex tw:items-start tw:gap-2"
      >
        <IconSparkles :size="16" class="tw:shrink-0 tw:mt-0.5" />
        <span>
          Describe the checklist and the AI drafts the grid — items become rows,
          the answer format becomes columns. <strong>Applying overwrites the
          current rows and columns.</strong>
        </span>
      </div>

      <BaseField v-slot="{ id: fieldId }" label="What should the checklist cover?">
        <BaseTextarea
          :id="fieldId"
          v-model="prompt"
          :rows="3"
          placeholder="e.g. Line clearance checklist for a tablet packaging line, with Yes / No / N/A per item and a comments column."
          :required="true"
        />
      </BaseField>

      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseButton
          variant="primary"
          :loading="generating"
          :disabled="generating || !prompt.trim()"
          @click="generate"
        >
          <template #icon><IconWand :size="16" /></template>
          {{ preview ? 'Regenerate' : 'Generate' }}
        </BaseButton>
        <span v-if="generating" class="tw:text-xs tw:text-secondary">Drafting the grid…</span>
      </div>

      <div
        v-if="error"
        class="tw:rounded-lg tw:border tw:border-red-300 tw:bg-red-50 tw:p-3 tw:text-xs tw:text-red-800 tw:flex tw:items-start tw:gap-2"
      >
        <IconAlertTriangle :size="16" class="tw:shrink-0 tw:mt-0.5" />
        <span>{{ error }}</span>
      </div>

      <!-- Preview grid -->
      <div v-if="preview" class="tw:flex tw:flex-col tw:gap-2">
        <div v-if="preview.title" class="tw:font-semibold tw:text-on-main tw:text-sm">
          {{ preview.title }}
        </div>
        <div class="tw:text-caption tw:text-secondary">
          {{ preview.rows.length }} row{{ preview.rows.length === 1 ? '' : 's' }} ·
          {{ preview.columns.length }} column{{ preview.columns.length === 1 ? '' : 's' }}
        </div>
        <div class="tw:overflow-x-auto tw:rounded-lg tw:border tw:border-divider">
          <table class="tw:w-full tw:border-collapse tw:text-xs">
            <thead>
              <tr class="tw:bg-main-hover">
                <th class="tw:px-2 tw:py-1.5 tw:text-left tw:text-secondary tw:font-medium"></th>
                <th
                  v-for="(col, ci) in preview.columns"
                  :key="'h' + ci"
                  class="tw:px-2 tw:py-1.5 tw:text-center tw:font-medium tw:text-on-main tw:whitespace-nowrap"
                >
                  {{ col.label }}
                  <span class="tw:text-micro tw:text-secondary tw:font-normal">
                    ({{ columnTypeLabel[col.inputType] || col.inputType }})
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, ri) in preview.rows"
                :key="'r' + ri"
                class="tw:border-t tw:border-divider"
              >
                <td class="tw:px-2 tw:py-1.5 tw:text-on-main">{{ row }}</td>
                <td
                  v-for="(col, ci) in preview.columns"
                  :key="'c' + ri + '-' + ci"
                  class="tw:px-2 tw:py-1.5 tw:text-center tw:text-placeholder"
                >
                  ·
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" @click="close">Cancel</BaseButton>
      <BaseButton v-if="preview" variant="primary" @click="apply">
        <template #icon><IconSparkles :size="16" /></template>
        Apply to checklist
      </BaseButton>
    </template>
  </BaseDialog>
</template>
