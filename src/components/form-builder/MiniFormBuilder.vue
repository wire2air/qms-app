<script setup>
/**
 * MiniFormBuilder — the full builder's canvas, inline (user request 2026-08-14).
 *
 * Hosts that only need "a couple of text fields" (workflow step task forms
 * being the first) shouldn't have to open the full-screen FormBuilder. This
 * renders JUST the center canvas — the same FormCanvas/FormCanvasField cards,
 * the same drag-to-reorder, delete and duplicate — with an "+ Add field"
 * button after the last element instead of the component-library sidebar.
 *
 * Add field opens a small popup: the most common components (the palette's
 * first category, Input Fields) as a quick-pick grid, plus a searchable
 * dropdown covering every other component. Clicking a field card on the
 * canvas opens the same FormFieldConfig editor in a dialog.
 *
 * State lives in the same useFormBuilder composable the full builder uses.
 * The host owns persistence: listen to `update:schema` (fires on every deep
 * change — debounce the save) and re-mount via `:key` to re-seed after an
 * external change (e.g. a full-builder save or an AI generate).
 */
import { IconPlus, IconSettings } from '@tabler/icons-vue'
import { useFormBuilder } from '@/composables/useFormBuilder'
import { FIELD_TYPES, CATEGORY_LABELS } from '@/constants/formBuilderConfig'
import FormCanvas from './FormCanvas.vue'
import FormFieldConfig from './FormFieldConfig.vue'

const props = defineProps({
  initialSchema: { type: Array, default: () => [] },
  // Forwarded to FormFieldConfig (Custom Fields / module templates hosts).
  showSectionPlacement: { type: Boolean, default: false },
  showScoring: { type: Boolean, default: false },
})

const emit = defineEmits(['update:schema'])

// Per-instance drag group. Several mini builders can be mounted at once (the
// workflow builder expands every step), and a shared SortableJS group would
// let a field be dragged out of one step's form into another's — a move
// neither schema array records. There's no palette here, so nothing needs to
// drop in from outside this canvas.
const dragGroup = `mini-form-${useId()}`

// Deep-copy the seed — useFormBuilder mutates the array it's given, and the
// host's copy (e.g. step.formSchema) must only change through update:schema.
const {
  schema,
  selectedField,
  selectedFieldPath,
  isDragging,
  addField,
  removeField,
  moveField,
  selectField,
  clearSelection,
  duplicateField,
  changeFieldKind,
} = useFormBuilder(JSON.parse(JSON.stringify(props.initialSchema ?? [])))

// Sibling lookup fields for cascading config (mirrors FormBuilder).
function collectLookupFields(fields, out = []) {
  for (const f of fields || []) {
    if (f?.type === 'lookup' && f.name && f.lookupEntity && f.lookupEntity !== 'optionSet') {
      out.push({ name: f.name, label: f.label, lookupEntity: f.lookupEntity })
    }
    if (Array.isArray(f?.fields)) collectLookupFields(f.fields, out)
    if (Array.isArray(f?.children)) collectLookupFields(f.children, out)
  }
  return out
}
const siblingLookups = computed(() =>
  collectLookupFields(schema.value?.fields || schema.value || []),
)

watch(
  schema,
  (s) => {
    emit('update:schema', s)
  },
  { deep: true },
)

// ── Add-field popup ──────────────────────────────────────────────────────────
const showAddDialog = ref(false)

// Quick picks = the palette's first category (Input Fields) — the common case.
const quickPickTypes = computed(() =>
  Object.entries(FIELD_TYPES)
    .filter(([, meta]) => meta.category === 'input')
    .map(([type, meta]) => ({ type, ...meta })),
)

// Everything else goes in the searchable dropdown (BaseSelect searches the
// `name` text, so the category is baked into it).
const otherTypeOptions = computed(() =>
  Object.entries(FIELD_TYPES)
    .filter(([, meta]) => meta.category !== 'input')
    .map(([type, meta]) => ({
      id: type,
      name: `${meta.label} · ${CATEGORY_LABELS[meta.category] ?? meta.category}`,
    })),
)
const otherTypePick = ref(null)

function pickType(type) {
  if (!type) return
  addField(type)
  // addField auto-selects the new field — clear so the settings dialog only
  // opens on an explicit card click, keeping quick-adds quick.
  clearSelection()
  otherTypePick.value = null
  showAddDialog.value = false
}

watch(showAddDialog, (open) => {
  if (open) otherTypePick.value = null
})

// ── Field settings dialog (same FormFieldConfig as the full builder) ─────────
// Opened ONLY by the field card's gear (user request 2026-08-15). Clicking a
// card — or its label, to rename in place — just highlights it; the dialog
// used to land on top of exactly the edit the user was trying to make.
const showSettingsDialog = ref(false)

function handleSelectField(path) {
  selectField(path)
}

function handleConfigureField(path) {
  selectField(path)
  showSettingsDialog.value = true
}

watch(showSettingsDialog, (open) => {
  if (!open) clearSelection()
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <FormCanvas
      :fields="schema"
      :selectedPath="selectedFieldPath"
      :isDragging="isDragging"
      :group="dragGroup"
      :bordered="false"
      emptyDescription="No fields yet — use “Add field” below."
      class="tw:min-h-40!"
      @addField="addField"
      @selectField="handleSelectField"
      @configureField="handleConfigureField"
      @changeFieldKind="changeFieldKind"
      @removeField="removeField"
      @duplicateField="duplicateField"
      @moveField="moveField"
    />

    <!-- Add field — after the last element, like the flow's Add Step -->
    <button
      type="button"
      class="tw:w-full tw:py-3 tw:border-2 tw:border-dashed tw:border-divider tw:rounded-xl tw:flex tw:items-center tw:justify-center tw:gap-2 tw:text-secondary tw:hover:text-primary tw:hover:border-primary tw:hover:bg-primary/5 tw:transition-all"
      @click="showAddDialog = true"
    >
      <IconPlus :size="18" />
      <span class="tw:text-sm tw:font-bold">Add field</span>
    </button>

    <!-- Add-field popup: common components grid + searchable dropdown -->
    <BaseDialog v-model="showAddDialog" title="Add a field" maxWidth="lg">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div>
          <BaseText variant="overline" class="tw:block tw:mb-2">
            {{ CATEGORY_LABELS.input }}
          </BaseText>
          <div class="tw:grid tw:grid-cols-2 tw:sm:grid-cols-3 tw:gap-2">
            <BaseClickableRow
              v-for="t in quickPickTypes"
              :key="t.type"
              class="tw:flex tw:items-center tw:gap-2 tw:p-2 tw:rounded-xl tw:border tw:border-divider tw:bg-main tw:hover:border-primary tw:hover:bg-main-selected tw:transition-all"
              :aria-label="`Add ${t.label} field`"
              @click="pickType(t.type)"
            >
              <div
                class="tw:w-8 tw:h-8 tw:bg-main-hover tw:rounded-lg tw:flex tw:items-center tw:justify-center tw:shrink-0"
              >
                <component :is="t.icon" :size="18" class="tw:text-primary" />
              </div>
              <span class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">
                {{ t.label }}
              </span>
            </BaseClickableRow>
          </div>
        </div>

        <div>
          <BaseText variant="overline" class="tw:block tw:mb-2">More components</BaseText>
          <BaseSelect
            v-model="otherTypePick"
            :options="otherTypeOptions"
            optionLabel="name"
            optionValue="id"
            nullLabel="— Search all components —"
            @update:modelValue="pickType"
          />
          <BaseCaption class="tw:mt-1.5 tw:block">
            Selection lists, checklists, tables, layout elements and widgets — everything the full
            form builder offers.
          </BaseCaption>
        </div>
      </div>
    </BaseDialog>

    <!-- Field settings — the full builder's FormFieldConfig, in a dialog -->
    <BaseDialog
      v-model="showSettingsDialog"
      :title="selectedField?.label || 'Field Settings'"
      maxWidth="2xl"
    >
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary tw:px-1 tw:pb-2">
        <IconSettings :size="16" />
        <BaseCaption>Changes apply to the canvas immediately.</BaseCaption>
      </div>
      <FormFieldConfig
        v-if="selectedField"
        v-model:field="selectedField"
        :path="selectedFieldPath"
        :showSectionPlacement="showSectionPlacement"
        :showScoring="showScoring"
        :siblingLookups="siblingLookups"
      />
      <template #footer="{ close }">
        <BaseButton variant="primary" @click="close">Done</BaseButton>
      </template>
    </BaseDialog>
  </div>
</template>
