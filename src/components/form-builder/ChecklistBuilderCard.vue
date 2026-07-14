<script setup>
/**
 * Interactive checklist matrix for the builder canvas. The table renders to look
 * like the live form / Preview panel (BaseChecklist) — same header, dividers and
 * radio/checkbox cells + the field's table style — while adding builder-only
 * affordances inline: "+ Add row" below the rows, "+ Add column" next to the
 * last column, per-row/column delete on hover, each backed by a small dialog.
 * Mutates the shared field object (field.rows / field.columns) directly.
 */
import { IconPlus, IconTrash, IconX, IconSparkles } from '@tabler/icons-vue'
import { COLUMN_INPUT_TYPES } from '@/constants/formBuilderConfig'
import { canUseAi } from '@/utils/currentSession'
import { hydrateChecklistColumns, hydrateChecklistRows } from '@/utils/aiFormHydrate'
import { tableStyleClasses, cx } from '@/utils/tableStyle'

const props = defineProps({
  field: { type: Object, required: true },
})

const columnTypeItems = computed(() =>
  COLUMN_INPUT_TYPES.map((o) => ({ id: o.value, name: o.label })),
)
const columnTypeLabel = (v) => COLUMN_INPUT_TYPES.find((o) => o.value === v)?.label || 'Text'

function toCamelCase(str) {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (w, i) => (i === 0 ? w.toLowerCase() : w.toUpperCase()))
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
}

// ── Rows ──────────────────────────────────────────────────────────────────────
const showRowDialog = ref(false)
const rowDraft = ref('')
function openRowDialog() {
  rowDraft.value = ''
  showRowDialog.value = true
}
function saveRow() {
  const label = rowDraft.value.trim()
  if (!label) return
  if (!Array.isArray(props.field.rows)) props.field.rows = []
  props.field.rows.push(label)
  showRowDialog.value = false
}
function removeRow(i) {
  props.field.rows.splice(i, 1)
}

// ── Columns ───────────────────────────────────────────────────────────────────
const showColDialog = ref(false)
const colDraft = ref({ label: '', inputType: 'radio' })
function openColDialog() {
  colDraft.value = { label: '', inputType: 'radio' }
  showColDialog.value = true
}
function saveColumn() {
  const label = colDraft.value.label.trim()
  if (!label) return
  if (!Array.isArray(props.field.columns)) props.field.columns = []
  const base = toCamelCase(label) || 'col'
  let value = base
  let n = 1
  const existing = props.field.columns.map((c) => c.value)
  while (existing.includes(value)) value = `${base}_${n++}`
  const col = { label, value, inputType: colDraft.value.inputType }
  if (['select', 'dropdown'].includes(colDraft.value.inputType)) col.options = []
  props.field.columns.push(col)
  showColDialog.value = false
}
function removeColumn(i) {
  props.field.columns.splice(i, 1)
}

const rows = computed(() => props.field.rows || [])
const columns = computed(() => props.field.columns || [])
const ts = computed(() => tableStyleClasses(props.field))

// ── AI generate ─────────────────────────────────────────────────────────────
const showAiDialog = ref(false)
function applyAiChecklist(result) {
  const newRows = hydrateChecklistRows(result?.rows)
  const newColumns = hydrateChecklistColumns(result?.columns)
  if (!newRows.length || !newColumns.length) return
  // Overwrite (the dialog told the user this).
  props.field.rows = newRows
  props.field.columns = newColumns
  // Adopt the suggested field label only when the author hasn't set one.
  if (result?.title && !props.field.label) props.field.label = result.title
}
</script>

<template>
  <div class="tw:mt-2" @click.stop @mousedown.stop>
    <!-- Field label, like BaseChecklist renders it on the live form. -->
    <div v-if="field.label" class="tw:text-sm tw:font-medium tw:text-secondary tw:mb-1">
      {{ field.label }}
    </div>

    <div class="tw:overflow-x-auto">
      <table :class="cx('tw:w-full tw:border-collapse tw:text-sm', ts.tableClass)">
        <thead>
          <tr>
            <th
              :class="
                cx(
                  'tw:text-left tw:font-medium tw:border-b tw:border-divider tw:py-2 tw:px-3',
                  ts.headerClass,
                  ts.headerCellClass,
                )
              "
            ></th>
            <th
              v-for="(col, ci) in columns"
              :key="'h-' + ci"
              :class="
                cx(
                  'tw:text-center tw:font-medium tw:border-b tw:border-divider tw:py-2 tw:px-3 tw:group',
                  ts.headerClass,
                  ts.headerCellClass,
                )
              "
            >
              <div class="tw:inline-flex tw:items-center tw:gap-1">
                <span class="tw:truncate">{{ col.label || 'Column' }}</span>
                <span
                  class="tw:text-micro tw:text-secondary tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity"
                >
                  ({{ columnTypeLabel(col.inputType) }})
                </span>
                <button
                  type="button"
                  class="tw:opacity-0 tw:group-hover:opacity-100 tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
                  title="Remove column"
                  @click.stop="removeColumn(ci)"
                >
                  <IconX :size="13" />
                </button>
              </div>
            </th>
            <!-- Add column (next to the last column) -->
            <th :class="cx('tw:py-2 tw:px-3 tw:align-middle tw:border-b tw:border-divider', ts.headerClass)">
              <button
                type="button"
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-primary tw:hover:bg-primary/10 tw:rounded tw:px-2 tw:py-1 tw:text-xs tw:font-medium tw:bg-transparent tw:border-0 tw:cursor-pointer tw:whitespace-nowrap"
                @click.stop="openColDialog"
              >
                <IconPlus :size="14" /> Add column
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in rows" :key="'r-' + ri" :class="cx('tw:hover:bg-gray-50 tw:group', ts.rowClass)">
            <td :class="cx('tw:text-on-main tw:border-b tw:border-divider tw:py-2 tw:px-3', ts.cellClass)">
              <span class="tw:inline-flex tw:items-center tw:gap-1">
                {{ row || 'Row' }}
                <button
                  type="button"
                  class="tw:opacity-0 tw:group-hover:opacity-100 tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
                  title="Remove row"
                  @click.stop="removeRow(ri)"
                >
                  <IconTrash :size="13" />
                </button>
              </span>
            </td>
            <td
              v-for="(col, ci) in columns"
              :key="'c-' + ri + '-' + ci"
              :class="cx('tw:text-center tw:border-b tw:border-divider tw:py-2 tw:px-3', ts.cellClass)"
            >
              <!-- Non-interactive cell preview, matching BaseChecklist's look. -->
              <div
                v-if="['select', 'dropdown'].includes(col.inputType)"
                class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:rounded tw:border tw:border-divider tw:bg-sidebar tw:px-2 tw:py-1 tw:text-xs tw:text-placeholder"
              >
                Select <span>⌄</span>
              </div>
              <input
                v-else-if="['text', 'number', 'date', 'time'].includes(col.inputType)"
                disabled
                class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-sidebar tw:px-2 tw:py-1 tw:text-xs"
              />
              <span
                v-else-if="col.inputType === 'checkbox'"
                class="tw:size-4 tw:rounded tw:border-2 tw:border-gray-300 tw:bg-white tw:inline-block"
              />
              <span
                v-else
                class="tw:size-4 tw:rounded-full tw:border-2 tw:border-gray-300 tw:bg-white tw:inline-block"
              />
            </td>
            <td :class="cx('tw:border-b tw:border-divider', ts.cellClass)" />
          </tr>
          <tr v-if="!rows.length">
            <td colspan="99" class="tw:px-3 tw:py-2 tw:text-xs tw:text-secondary tw:italic">
              No rows yet.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add row (below the last row) + AI generate. The AI trigger is a compact
         icon here at the bottom-left so it never collides with the card's
         floating controls (grip/clone/delete) at the top-right. -->
    <div class="tw:mt-1 tw:flex tw:items-center tw:gap-1">
      <button
        type="button"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-primary tw:hover:bg-primary/10 tw:rounded tw:px-2 tw:py-1 tw:text-xs tw:font-medium tw:bg-transparent tw:border-0 tw:cursor-pointer"
        @click.stop="openRowDialog"
      >
        <IconPlus :size="14" /> Add row
      </button>
      <BaseTooltip v-if="canUseAi" content="Generate with AI" placement="top">
        <button
          type="button"
          class="tw:inline-flex tw:items-center tw:justify-center tw:size-7 tw:text-primary tw:hover:bg-primary/10 tw:rounded tw:bg-transparent tw:border tw:border-primary/30 tw:cursor-pointer"
          aria-label="Generate checklist with AI"
          @click.stop="showAiDialog = true"
        >
          <IconSparkles :size="15" />
        </button>
      </BaseTooltip>
    </div>

    <!-- Add Row dialog -->
    <BaseDialog v-model="showRowDialog" title="Add row" size="sm">
      <div class="tw:flex tw:flex-col tw:gap-2">
        <BaseText as="div" variant="overline">Row title</BaseText>
        <BaseTextInput
          v-model="rowDraft"
          placeholder="e.g. Products Affected"
          @keyup.enter="saveRow"
        />
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter submitLabel="Add row" :disabled="!rowDraft.trim()" @cancel="close" @submit="saveRow" />
      </template>
    </BaseDialog>

    <!-- Add Column dialog -->
    <BaseDialog v-model="showColDialog" title="Add column" size="sm">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:flex tw:flex-col tw:gap-2">
          <BaseText as="div" variant="overline">Column title</BaseText>
          <BaseTextInput v-model="colDraft.label" placeholder="e.g. Yes / No / N/A" @keyup.enter="saveColumn" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-2">
          <BaseText as="div" variant="overline">Component</BaseText>
          <BaseSelect
            v-model="colDraft.inputType"
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
        <BaseDialogFooter submitLabel="Add column" :disabled="!colDraft.label.trim()" @cancel="close" @submit="saveColumn" />
      </template>
    </BaseDialog>

    <!-- AI generate dialog (owns the AI call; we only react to @apply). -->
    <ChecklistAiGenerateDialog
      v-if="canUseAi"
      v-model="showAiDialog"
      :contextHint="props.field.label || ''"
      @apply="applyAiChecklist"
    />
  </div>
</template>
