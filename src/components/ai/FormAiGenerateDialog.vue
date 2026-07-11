<script setup>
/**
 * AI-generate a whole form schema from a plain-language prompt.
 *
 * Two-step flow (mirrors AuditStandardAiGenerateDialog):
 *   1. User describes the form → POST /v1/services/ai/tasks/form.generate_schema/run.
 *      The model returns { title, description?, fields[] } where each field is a
 *      lightweight descriptor (type + label + hints + optional section grouping).
 *   2. A preview lists the fields grouped by section. On Apply we emit the raw
 *      result; the host (FormBuilder) hydrates it through the real field factory
 *      and REPLACES the current schema.
 *
 * AI-sidecar isolation: this component owns the AI call; the host only mounts it
 * behind `v-if="canUseAi"` and reacts to @apply. No AI logic leaks into the host.
 */
import { IconSparkles, IconAlertTriangle, IconWand } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'apply'])

const prompt = ref('')
const context = ref('')
const generating = ref(false)
const preview = ref(null) // { title, description?, fields[] }
const error = ref(null)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    prompt.value = ''
    context.value = ''
    preview.value = null
    error.value = null
  },
)

function close() {
  emit('update:modelValue', false)
}

// Generation is expensive; the default 30s axios timeout is too tight for a
// 60-field form. Match the audit-standard generator's 3-min ceiling.
const AI_GENERATE_TIMEOUT_MS = 3 * 60_000

async function generate() {
  if (generating.value || !prompt.value.trim()) return
  generating.value = true
  preview.value = null
  error.value = null
  try {
    const res = await post(
      '/v1/services/ai/tasks/form.generate_schema/run',
      { prompt: prompt.value.trim(), context: context.value.trim() || undefined },
      { timeout: AI_GENERATE_TIMEOUT_MS },
    )
    const out = res?.result
    if (!out?.fields?.length) {
      error.value = 'The AI didn\'t return any fields. Try describing the form in more detail.'
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

// Group the preview fields by their section label (first-appearance order) so
// the preview reads the way the built form will look.
const previewGroups = computed(() => {
  const fields = preview.value?.fields ?? []
  const groups = []
  const byLabel = new Map()
  for (const f of fields) {
    const label = f.section?.trim() || null
    const key = label || '__top__'
    let g = byLabel.get(key)
    if (!g) {
      g = { label, fields: [] }
      byLabel.set(key, g)
      groups.push(g)
    }
    g.fields.push(f)
  }
  return groups
})

const fieldCount = computed(() => preview.value?.fields?.length ?? 0)

function typeLabel(type) {
  return type || 'input'
}
</script>

<template>
  <BaseDialog
    :modelValue="modelValue"
    title="Generate form with AI"
    maxWidth="2xl"
    @update:modelValue="close"
  >
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <!-- Context strip -->
      <div
        class="tw:rounded-lg tw:bg-purple-50 tw:border tw:border-purple-200 tw:p-3 tw:text-xs tw:text-purple-900 tw:leading-relaxed tw:flex tw:items-start tw:gap-2"
      >
        <IconSparkles :size="16" class="tw:shrink-0 tw:mt-0.5" />
        <span>
          Describe the form you need and the AI drafts the fields — grouped into
          sections, with the right field type per question. You can preview it
          before applying. <strong>Applying replaces the current fields.</strong>
        </span>
      </div>

      <BaseField v-slot="{ id: fieldId }" label="What should the form capture?">
        <BaseTextarea
          :id="fieldId"
          v-model="prompt"
          :rows="4"
          placeholder="e.g. A supplier onboarding form with company details, quality certifications, a self-assessment checklist, and a QA sign-off section."
          :required="true"
        />
      </BaseField>

      <BaseField v-slot="{ id: fieldId }" label="Additional context" optional>
        <BaseTextarea
          :id="fieldId"
          v-model="context"
          :rows="2"
          placeholder="Industry/sector, a standard it supports, or specific fields you want included…"
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
        <span v-if="generating" class="tw:text-xs tw:text-secondary">
          Drafting the form… this can take up to a minute.
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
          <div class="tw:font-semibold tw:text-on-main">{{ preview.title }}</div>
          <div v-if="preview.description" class="tw:text-xs tw:text-secondary">
            {{ preview.description }}
          </div>
          <div class="tw:text-caption tw:text-secondary tw:mt-1">
            {{ fieldCount }} field{{ fieldCount === 1 ? '' : 's' }} across
            {{ previewGroups.length }} group{{ previewGroups.length === 1 ? '' : 's' }}
          </div>
        </div>

        <div class="tw:max-h-80 tw:overflow-y-auto tw:flex tw:flex-col tw:gap-3">
          <div v-for="(group, gi) in previewGroups" :key="gi" class="tw:flex tw:flex-col tw:gap-1">
            <div
              v-if="group.label"
              class="tw:text-micro tw:uppercase tw:tracking-wide tw:text-primary tw:font-semibold tw:px-1"
            >
              {{ group.label }}
            </div>
            <div
              class="tw:rounded-lg tw:border tw:border-divider tw:overflow-hidden tw:divide-y tw:divide-divider"
            >
              <div
                v-for="(f, fi) in group.fields"
                :key="fi"
                class="tw:flex tw:items-center tw:gap-3 tw:px-3 tw:py-1.5 tw:text-xs"
              >
                <span
                  class="tw:shrink-0 tw:w-24 tw:text-micro tw:uppercase tw:tracking-wide tw:text-secondary tw:bg-main-hover tw:rounded tw:px-1.5 tw:py-0.5 tw:text-center tw:truncate"
                >
                  {{ typeLabel(f.type) }}
                </span>
                <span class="tw:text-on-main tw:flex-1 tw:min-w-0 tw:truncate">{{ f.label }}</span>
                <span v-if="f.required" class="tw:text-bad tw:shrink-0" title="Required">*</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" @click="close">Cancel</BaseButton>
      <BaseButton v-if="preview" variant="primary" @click="apply">
        <template #icon><IconSparkles :size="16" /></template>
        Apply {{ fieldCount }} field{{ fieldCount === 1 ? '' : 's' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
