<script setup>
/**
 * Card-style template picker for a workflow step's Task Form — mirrors the
 * /templates "Create New Template → Choose Template" gallery (Blank card +
 * preview cards with a scaled-down readonly DynamicForm).
 *
 * Sources:
 *   - Blank Form (clean slate)
 *   - Built-in QMS starting points (QMS_TEMPLATES presets)
 *   - The tenant's ACTIVE saved form templates
 *
 * Select a card → "Design Form" emits the chosen schema; the host opens the
 * form builder seeded with it. Nothing is persisted here.
 */
import { IconCirclePlus, IconFileDescription, IconBrush } from '@tabler/icons-vue'
import { QMS_BLOCKS } from '@/constants/formTemplates'

const emit = defineEmits(['select'])
const open = defineModel({ type: Boolean, default: false })

const search = ref('')
const selectedKey = ref(null)
const selectedSchema = ref(null)

watch(open, (isOpen) => {
  if (!isOpen) return
  search.value = ''
  selectedKey.value = null
  selectedSchema.value = null
})

// The tenant's saved FORM BLOCKS (reusable fragments) with a schema worth
// copying — standalone form templates are deliberately excluded; a step's task
// form wants fragments (checklists, sign-offs), not whole Deviation Reports.
const savedBlocks = useLiveQuery(
  async (db) =>
    (await db.FormTemplate.where('statusId', 'ACTIVE').exec()).filter((t) => t.kind === 'BLOCK'),
  { models: ['FormTemplate'], initial: [] },
)

const filteredSaved = computed(() => {
  const withSchema = savedBlocks.value.filter((t) => (t.schema?.length ?? 0) > 0)
  if (!search.value.trim()) return withSchema
  const q = search.value.toLowerCase()
  return withSchema.filter((t) => t.title?.toLowerCase().includes(q))
})

const filteredPresets = computed(() => {
  if (!search.value.trim()) return QMS_BLOCKS
  const q = search.value.toLowerCase()
  return QMS_BLOCKS.filter((p) => p.title.toLowerCase().includes(q))
})

function pick(key, schema) {
  selectedKey.value = key
  selectedSchema.value = schema
}

function confirm() {
  if (selectedKey.value === null) return
  emit('select', JSON.parse(JSON.stringify(selectedSchema.value ?? [])))
  open.value = false
}
</script>

<template>
  <BaseDialog v-model="open" title="Create Task Form" maxWidth="2xl">
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <p class="tw:text-sm tw:text-secondary">
        Pick a starting point for the form the assignee fills in to complete this step — a blank
        form or a reusable <strong>form block</strong>. You can customize every field in the next
        step.
      </p>

      <BaseTextInput v-model="search" placeholder="Search blocks…" />

      <div
        class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-4 tw:overflow-auto tw:max-h-125 tw:p-1"
      >
        <!-- Blank -->
        <BaseClickableRow
          class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:p-8 tw:border tw:border-divider tw:rounded-xl tw:transition-all tw:duration-200 tw:bg-main tw:hover:bg-main-hover tw:hover:border-primary"
          :class="{ 'tw:border-primary tw:bg-main-hover': selectedKey === 'blank' }"
          aria-label="Start from a blank form"
          @click="pick('blank', [])"
        >
          <IconCirclePlus :size="48" class="tw:text-secondary/40" />
          <div class="tw:text-lg tw:font-bold tw:mt-4 tw:text-on-main">Blank Form</div>
          <div class="tw:text-xs tw:text-secondary tw:text-center">Start from a clean slate</div>
        </BaseClickableRow>

        <!-- Built-in starting points -->
        <BaseClickableRow
          v-for="preset in filteredPresets"
          :key="`preset:${preset.code}`"
          class="tw:flex tw:flex-col tw:p-4 tw:border tw:border-divider tw:rounded-xl tw:transition-all tw:duration-200 tw:bg-main tw:hover:bg-main-hover tw:hover:border-primary"
          :class="{ 'tw:border-primary tw:bg-main-hover': selectedKey === `preset:${preset.code}` }"
          :aria-label="`Use template ${preset.title}`"
          @click="pick(`preset:${preset.code}`, preset.schema)"
        >
          <div class="tw:flex tw:items-center tw:justify-between tw:mb-3">
            <span class="tw:text-sm tw:font-bold tw:text-primary">{{ preset.title }}</span>
            <IconFileDescription :size="16" class="tw:text-primary" />
          </div>
          <div
            class="tw:h-45 tw:overflow-hidden tw:relative tw:bg-main tw:border tw:border-divider tw:rounded-lg"
          >
            <div class="tw:w-[200%] tw:scale-[0.5] tw:origin-top-left tw:p-4 tw:pointer-events-none">
              <DynamicForm :fields="preset.schema" readonly :modelValue="{}" />
            </div>
          </div>
        </BaseClickableRow>

        <!-- The tenant's saved form blocks -->
        <BaseClickableRow
          v-for="tpl in filteredSaved"
          :key="`saved:${tpl.id}`"
          class="tw:flex tw:flex-col tw:p-4 tw:border tw:border-divider tw:rounded-xl tw:transition-all tw:duration-200 tw:bg-main tw:hover:bg-main-hover tw:hover:border-primary"
          :class="{ 'tw:border-primary tw:bg-main-hover': selectedKey === `saved:${tpl.id}` }"
          :aria-label="`Use form block ${tpl.title}`"
          @click="pick(`saved:${tpl.id}`, tpl.schema)"
        >
          <div class="tw:flex tw:items-center tw:justify-between tw:mb-3">
            <span class="tw:text-sm tw:font-bold tw:text-primary">{{ tpl.title }}</span>
            <span class="tw:text-micro tw:uppercase tw:tracking-wide tw:text-secondary">
              Your block
            </span>
          </div>
          <div
            class="tw:h-45 tw:overflow-hidden tw:relative tw:bg-main tw:border tw:border-divider tw:rounded-lg"
          >
            <div class="tw:w-[200%] tw:scale-[0.5] tw:origin-top-left tw:p-4 tw:pointer-events-none">
              <DynamicForm :fields="tpl.schema" readonly :modelValue="{}" />
            </div>
          </div>
        </BaseClickableRow>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" @click="open = false">Cancel</BaseButton>
      <BaseButton :disabled="selectedKey === null" @click="confirm">
        <template #icon><IconBrush :size="16" /></template>
        Design Form
      </BaseButton>
    </template>
  </BaseDialog>
</template>
