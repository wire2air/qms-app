<script setup>
/**
 * Builder card for an Input Table (a repeater rendered as "Product N" rows).
 *
 * Unlike a raw repeater — which the builder edits via nested drop zones — an
 * Input Table is edited by its COLUMNS: each column is a field, and respondents
 * add ROWS at fill time (so there's no "Add row" here). The card:
 *   - renders the field exactly like the live form / Preview panel (DynamicForm,
 *     non-interactive) so the designer matches the preview, and
 *   - shows a compact column manager: add a column via a dialog (title +
 *     component, the same shape as the checklist Add-column dialog) and remove
 *     columns inline.
 *
 * Data model: columns live on the single row wrapper at `field.template[0]`
 * (template[0].children). Each column is an ordinary field object with
 * `class: 'tw:grow'` so the row lays them out evenly, exactly as the seeded
 * Product Name / Product Category columns do.
 */
import { IconPlus, IconX } from '@tabler/icons-vue'
import { FIELD_TYPES_CONFIG } from '@/constants/formBuilderConfig'
import DynamicForm from '@/components/form/DynamicForm.js'

const props = defineProps({
  field: { type: Object, required: true },
})

// The component types a column can be. Mirrors the checklist Add-column dialog
// (title + component) but the values are real form field types.
const COLUMN_FIELD_TYPES = [
  { label: 'Text', type: 'input' },
  { label: 'Number', type: 'number' },
  { label: 'Email', type: 'email' },
  { label: 'Phone', type: 'phone' },
  { label: 'Dropdown', type: 'select' },
  { label: 'Date', type: 'datetime' },
  { label: 'Checkbox', type: 'checkbox' },
  { label: 'Yes / No', type: 'toggle' },
]
const columnTypeItems = COLUMN_FIELD_TYPES.map((o) => ({ id: o.type, name: o.label }))
const typeLabel = (t) => COLUMN_FIELD_TYPES.find((o) => o.type === t)?.label || t

const previewData = ref({})
const previewFields = computed(() => [{ ...props.field, width: 'full', hidden: false }])

// The row wrapper that holds the columns. Created on demand so a hand-built
// template (or one an edit left empty) still works.
function columnsHost() {
  if (!Array.isArray(props.field.template)) props.field.template = []
  let row = props.field.template[0]
  if (!row || row.type !== 'row') {
    row = { type: 'row', name: 'row_1', colClass: 'tw:flex-1', children: [] }
    props.field.template.unshift(row)
  }
  if (!Array.isArray(row.children)) row.children = []
  return row
}
const columns = computed(() => props.field.template?.[0]?.children || [])

function toCamelCase(str) {
  return String(str || '')
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (w, i) => (i === 0 ? w.toLowerCase() : w.toUpperCase()))
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
}
function uniqueColumnName(title, type) {
  const base = toCamelCase(title) || type
  const existing = columns.value.map((c) => c.name)
  let name = base
  let n = 1
  while (existing.includes(name)) name = `${base}_${n++}`
  return name
}
function buildColumn(title, type) {
  const cfg = { type, ...FIELD_TYPES_CONFIG.base, ...(FIELD_TYPES_CONFIG[type] || {}) }
  cfg.label = title
  cfg.name = uniqueColumnName(title, type)
  cfg.class = 'tw:grow'
  // Deep clone so array/object defaults (e.g. select options) aren't shared.
  return JSON.parse(JSON.stringify(cfg))
}

// ── Add / remove columns ────────────────────────────────────────────────────
const showColDialog = ref(false)
const colDraft = ref({ label: '', type: 'input' })
function openColDialog() {
  colDraft.value = { label: '', type: 'input' }
  showColDialog.value = true
}
function saveColumn() {
  const label = colDraft.value.label.trim()
  if (!label) return
  columnsHost().children.push(buildColumn(label, colDraft.value.type))
  showColDialog.value = false
}
function removeColumn(i) {
  columnsHost().children.splice(i, 1)
}

const addRowLabel = computed(() => props.field.addLabel || 'Add row')
</script>

<template>
  <div class="tw:mt-2" @click.stop @mousedown.stop>
    <!-- WYSIWYG preview — identical to the live form / Preview panel. -->
    <div class="tw:pointer-events-none">
      <DynamicForm v-model="previewData" :fields="previewFields" />
    </div>

    <!-- Column manager -->
    <div class="tw:mt-3 tw:border-t tw:border-divider tw:pt-2">
      <div class="tw:flex tw:items-center tw:justify-between tw:mb-1.5">
        <span class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide">
          Columns
        </span>
        <button
          type="button"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:text-primary tw:hover:bg-primary/10 tw:rounded tw:px-2 tw:py-1 tw:text-xs tw:font-medium tw:bg-transparent tw:border tw:border-primary/30 tw:cursor-pointer"
          @click.stop="openColDialog"
        >
          <IconPlus :size="14" /> Add column
        </button>
      </div>
      <div class="tw:flex tw:flex-wrap tw:gap-1.5">
        <span
          v-for="(col, i) in columns"
          :key="col.name || i"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded tw:border tw:border-divider tw:bg-sidebar tw:px-2 tw:py-1 tw:text-xs tw:text-on-main"
        >
          {{ col.label || 'Column' }}
          <span class="tw:text-micro tw:text-secondary">({{ typeLabel(col.type) }})</span>
          <button
            type="button"
            class="tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
            title="Remove column"
            @click.stop="removeColumn(i)"
          >
            <IconX :size="13" />
          </button>
        </span>
        <span v-if="!columns.length" class="tw:text-xs tw:text-secondary tw:italic">
          No columns yet — add one to build the table.
        </span>
      </div>
      <p class="tw:text-micro tw:text-secondary tw:mt-1.5">
        Respondents add rows with the “{{ addRowLabel }}” button when filling the form.
      </p>
    </div>

    <!-- Add Column dialog (title + component — same shape as the checklist one). -->
    <BaseDialog v-model="showColDialog" title="Add column" size="sm">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:flex tw:flex-col tw:gap-2">
          <BaseText as="div" variant="overline">Column title</BaseText>
          <BaseTextInput
            v-model="colDraft.label"
            placeholder="e.g. Quantity"
            @keyup.enter="saveColumn"
          />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
          <BaseText as="div" variant="overline">Component</BaseText>
          <BaseSelect
            v-model="colDraft.type"
            :options="columnTypeItems"
            optionLabel="name"
            optionValue="id"
            :required="true"
          />
        </div>
        <p class="tw:text-xs tw:text-secondary">
          Dropdown columns get their options in the field settings panel after adding.
        </p>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Add column"
          :disabled="!colDraft.label.trim()"
          @cancel="close"
          @submit="saveColumn"
        />
      </template>
    </BaseDialog>
  </div>
</template>
