<script setup>
import { IconTrash, IconPlus, IconGripVertical } from '@tabler/icons-vue'
import { computed } from 'vue'
import { columnInputTypesFor } from '@/constants/formBuilderConfig'
import { useListReorder } from '@/composables/useListReorder.js'

const field = defineModel('field', {
  type: Object,
  required: true,
})

// Per column, so a legacy 'radio' column keeps a correct label and can be
// switched to a current type — without offering radio on the others.
function columnInputTypeItems(col) {
  return columnInputTypesFor(col?.inputType).map((opt) => ({ id: opt.value, name: opt.label }))
}

// Drag-to-reorder rows and columns (user request 2026-08-16). Without it a
// mis-ordered checklist had to be deleted and retyped from the first wrong
// row onwards.
const rowsRef = ref(null)
const columnsRef = ref(null)
// Named announcements rather than the composable's generic fallback: a
// checklist can run to a dozen rows, and "Moved to position 3 of 9" leaves a
// screen-reader user to work out WHICH row moved. An unlabelled row is
// described by the position it landed in, which is the number the listener is
// about to see beside it.
useListReorder(rowsRef, () => field.value?.rows, {
  handle: '.checklist-row-handle',
  announce: (row, to, total) =>
    `${String(row || '').trim() || `Row ${to + 1}`} moved to position ${to + 1} of ${total}.`,
})
useListReorder(columnsRef, () => field.value?.columns, {
  handle: '.checklist-col-handle',
  announce: (col, to, total) =>
    `${col?.label?.trim() || `Column ${to + 1}`} moved to position ${to + 1} of ${total}.`,
})

function addRow() {
  if (!field.value.rows) {
    field.value.rows = []
  }
  field.value.rows.push('')
}

function removeRow(index) {
  field.value.rows.splice(index, 1)
}

function addColumn() {
  if (!field.value.columns) {
    field.value.columns = []
  }
  const newIndex = field.value.columns.length
  // 'optionGroup' rather than 'radio' — see COLUMN_INPUT_TYPES.
  field.value.columns.push({ label: '', value: '', inputType: 'optionGroup', groupType: 'radio' })
  updateColumnValue(newIndex)
}

function toCamelCase(str) {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
      return index === 0 ? word.toLowerCase() : word.toUpperCase()
    })
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
}

function updateColumnValue(index) {
  const col = field.value.columns[index]
  if (!col) return

  if (!col.label) {
    col.value = ''
    return
  }

  const baseValue = toCamelCase(col.label) || 'col'
  let uniqueValue = baseValue
  let counter = 1

  // Check uniqueness against other columns in the same checklist
  const otherValues = field.value.columns.filter((_, i) => i !== index).map((c) => c.value)

  while (otherValues.includes(uniqueValue)) {
    uniqueValue = `${baseValue}_${counter}`
    counter++
  }

  col.value = uniqueValue
}

function removeColumn(index) {
  field.value.columns.splice(index, 1)
}

// Columns that carry an options list (with their original index): dropdowns
// AND option groups.
const selectColumns = computed(() => {
  if (!field.value.columns) return []
  return field.value.columns
    .map((col, index) => ({ ...col, _originalIndex: index }))
    .filter(
      (col) =>
        col.inputType === 'select' ||
        col.inputType === 'dropdown' ||
        col.inputType === 'optionGroup',
    )
})

// Seed the extra config an Option Group column needs when the author switches
// a column's type to it (options + radio/checkbox flavor + orientation).
function onColumnTypeChange(index) {
  const col = field.value.columns[index]
  if (!col) return
  if (col.inputType === 'optionGroup') {
    if (!Array.isArray(col.options)) col.options = []
    if (!col.groupType) col.groupType = 'radio'
    if (col.inline === undefined) col.inline = true
  }
}

// Describes the ANSWER, not the widget — matching how the field-type dropdown
// now names these ("Multiple choice" / "Checkboxes") rather than by control.
const GROUP_TYPE_ITEMS = [
  { id: 'radio', name: 'One answer' },
  { id: 'checkbox', name: 'Several answers' },
]
const ORIENTATION_ITEMS = [
  { id: 'horizontal', name: 'Horizontal' },
  { id: 'vertical', name: 'Vertical' },
]

function addColumnOption(selectColumnIndex) {
  const col = selectColumns.value[selectColumnIndex]
  if (!col) return
  const originalIndex = col._originalIndex

  const targetCol = field.value.columns[originalIndex]

  if (!targetCol.options) {
    targetCol.options = []
  }
  targetCol.options.push('')
}

function removeColumnOption(selectColumnIndex, optionIndex) {
  const col = selectColumns.value[selectColumnIndex]
  if (!col) return
  const originalIndex = col._originalIndex

  field.value.columns[originalIndex].options.splice(optionIndex, 1)
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <BaseText as="div" variant="overline">Rows</BaseText>
      <div ref="rowsRef" class="tw:contents">
        <div
          v-for="(row, index) in field.rows"
          :key="'row-' + index"
          class="tw:bg-main-hover tw:p-3 tw:rounded-lg"
        >
          <div class="tw:flex tw:gap-2 tw:items-center">
            <!--
              A real <button>, not a <span>, and that is load-bearing rather
              than tidiness. useListReorder gates its keyboard path on
              `e.target.closest(handle)` — an element that cannot take focus can
              never BE the target of a keydown, so as a <span> this grip had the
              arrow-key handler attached and permanently unreachable. The
              aria-label did not help either: on a <span> with no role it is
              largely ignored by assistive tech, so the control neither
              announced itself nor did anything.

              That is the exact failure the composable's own docblock describes
              (a control advertising a capability it does not have) — the
              wrapper was fixed in 2026-08-19, this consumer was not.
            -->
            <button
              type="button"
              class="checklist-row-handle tw:shrink-0 tw:cursor-grab tw:active:cursor-grabbing tw:text-secondary tw:hover:text-primary"
              :aria-label="`Reorder row ${index + 1}. Use arrow keys to move it, Home or End to send it to either end.`"
              aria-keyshortcuts="ArrowUp ArrowDown Home End"
            >
              <IconGripVertical :size="15" aria-hidden="true" />
            </button>
            <div class="tw:flex-1">
              <BaseTextInput v-model="field.rows[index]" placeholder="Row Label" size="sm" />
            </div>
            <button
              class="tw:p-1.5 tw:rounded tw:text-red-500 tw:hover:bg-red-50 tw:transition-colors"
              @click="removeRow(index)"
            >
              <IconTrash :size="16" />
            </button>
          </div>
        </div>
      </div>
      <button
        class="tw:self-start tw:flex tw:items-center tw:gap-1 tw:px-3 tw:py-1.5 tw:text-primary tw:rounded-lg tw:hover:bg-primary/10 tw:transition-colors tw:text-sm tw:font-medium"
        @click="addRow"
      >
        <IconPlus :size="14" />
        Add Row
      </button>
    </div>

    <div class="tw:flex tw:flex-col tw:gap-3">
      <BaseText as="div" variant="overline">Columns</BaseText>
      <div ref="columnsRef" class="tw:contents">
        <div
          v-for="(col, index) in field.columns"
          :key="'col-' + index"
          class="tw:bg-main-hover tw:p-3 tw:rounded-lg"
        >
          <div class="tw:flex tw:flex-col tw:gap-3">
            <div class="tw:flex tw:gap-2 tw:items-center">
              <!-- A <button> for the same reason as the row grip above. -->
              <button
                type="button"
                class="checklist-col-handle tw:shrink-0 tw:cursor-grab tw:active:cursor-grabbing tw:text-secondary tw:hover:text-primary"
                :aria-label="`Reorder column ${index + 1}. Use arrow keys to move it, Home or End to send it to either end.`"
                aria-keyshortcuts="ArrowUp ArrowDown Home End"
              >
                <IconGripVertical :size="15" aria-hidden="true" />
              </button>
              <div class="tw:flex-1">
                <BaseTextInput
                  v-model="col.label"
                  placeholder="Header Label"
                  size="sm"
                  @update:modelValue="updateColumnValue(index)"
                />
              </div>
              <button
                class="tw:p-1.5 tw:rounded tw:text-red-500 tw:hover:bg-red-50 tw:transition-colors"
                @click="removeColumn(index)"
              >
                <IconTrash :size="16" />
              </button>
            </div>
            <BaseSelect
              v-model="col.inputType"
              :options="columnInputTypeItems(col)"
              optionLabel="name"
              optionValue="id"
              :required="true"
              placeholder="Select Type"
              @update:modelValue="onColumnTypeChange(index)"
            />
            <template v-if="col.inputType === 'optionGroup'">
              <BaseSelect
                :modelValue="col.groupType || 'radio'"
                :options="GROUP_TYPE_ITEMS"
                optionLabel="name"
                optionValue="id"
                :required="true"
                @update:modelValue="(v) => (col.groupType = v)"
              />
              <BaseSelect
                :modelValue="col.inline === false ? 'vertical' : 'horizontal'"
                :options="ORIENTATION_ITEMS"
                optionLabel="name"
                optionValue="id"
                :required="true"
                @update:modelValue="(v) => (col.inline = v !== 'vertical')"
              />
            </template>
          </div>
        </div>
      </div>
      <button
        class="tw:self-start tw:flex tw:items-center tw:gap-1 tw:px-3 tw:py-1.5 tw:text-primary tw:rounded-lg tw:hover:bg-primary/10 tw:transition-colors tw:text-sm tw:font-medium"
        @click="addColumn"
      >
        <IconPlus :size="14" />
        Add Column
      </button>
    </div>

    <!-- Options for each Select/Dropdown column -->
    <template v-for="(col, colIndex) in selectColumns" :key="'col-options-' + colIndex">
      <div class="tw:flex tw:flex-col tw:gap-3">
        <BaseText as="div" variant="overline">
          Options for "{{ col.label || col.value || 'Column ' + (colIndex + 1) }}"
        </BaseText>
        <div
          v-for="(option, optIndex) in col.options || []"
          :key="'col-' + colIndex + '-option-' + optIndex"
          class="tw:bg-main-hover tw:p-3 tw:rounded-lg"
        >
          <div class="tw:flex tw:gap-2 tw:items-center">
            <div class="tw:flex-1">
              <BaseTextInput v-model="col.options[optIndex]" placeholder="Option" size="sm" />
            </div>
            <button
              class="tw:p-1.5 tw:rounded tw:text-red-500 tw:hover:bg-red-50 tw:transition-colors"
              @click="removeColumnOption(colIndex, optIndex)"
            >
              <IconTrash :size="16" />
            </button>
          </div>
        </div>
        <button
          class="tw:self-start tw:flex tw:items-center tw:gap-1 tw:px-3 tw:py-1.5 tw:text-primary tw:rounded-lg tw:hover:bg-primary/10 tw:transition-colors tw:text-sm tw:font-medium"
          @click="addColumnOption(colIndex)"
        >
          <IconPlus :size="14" />
          Add Option
        </button>
      </div>
    </template>

    <div class="tw:pt-2">
      <BaseCheckbox v-model="field.dense">Dense mode</BaseCheckbox>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
