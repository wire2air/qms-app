import { computed } from 'vue'

/**
 * useChecklistModel — the value-shape state machine behind BaseChecklist,
 * extracted so it's unit-testable in isolation (it used to live inline in a
 * 300-line component and was effectively unmountable to test — audit §7).
 *
 * BaseChecklist stores one of two model shapes depending on the columns:
 *   - UNIFORM (every column is a radio): a FLAT array, one value per row —
 *     the row's answer IS which column was picked → modelValue[rowIndex]
 *   - PER-CELL (anything else): an array of OBJECTS keyed by the column
 *     value → modelValue[rowIndex][colValue]
 *
 * "Uniform" used to mean "all columns share one inputType", so four text
 * columns (1st Hr … 4th Hr) collapsed to ONE value per row and typing in any
 * hour filled every hour (reported 2026-10-12, Hourly Torque Values). Only a
 * radio set is genuinely one-value-per-row; every other input type is an
 * independent cell even when the whole table is the same type.
 *
 * @param {import('vue').Ref<Array>} modelValue  the v-model ref (mutated in place by a fresh array)
 * @param {() => Array | import('vue').Ref<Array>} columns  the column defs (getter or ref)
 * @param {{ interactive?: () => boolean }} [opts]  interactive() gates writes (disabled/readonly)
 */
export function useChecklistModel(modelValue, columns, opts = {}) {
  const interactive = opts.interactive ?? (() => true)
  const readColumns = () => (typeof columns === 'function' ? columns() : (columns?.value ?? [])) || []

  // Uniform only when every column is a radio (the default inputType) — see
  // the header. Keep the exported name: BaseChecklist and the spec read it.
  const hasUniformInputType = computed(() => {
    const cols = readColumns()
    if (cols.length === 0) return true
    return cols.every((col) => (col.inputType || 'radio') === 'radio')
  })

  function getRowValue(rowIndex) {
    return modelValue.value[rowIndex]
  }

  function getCellValue(rowIndex, colValue, defaultValue = undefined) {
    const rowData = modelValue.value[rowIndex]
    if (rowData && typeof rowData === 'object') {
      return rowData[colValue] ?? defaultValue
    }
    return defaultValue
  }

  function getValue(rowIndex, colValue, defaultValue = undefined) {
    if (hasUniformInputType.value) {
      return getRowValue(rowIndex) ?? defaultValue
    }
    return getCellValue(rowIndex, colValue, defaultValue)
  }

  function isCellSelected(rowIndex, colValue) {
    return modelValue.value[rowIndex] === colValue
  }

  function setSimple(rowIndex, value) {
    if (!interactive()) return
    const next = [...modelValue.value]
    while (next.length <= rowIndex) next.push(null)
    next[rowIndex] = value
    modelValue.value = next
  }

  function setNested(rowIndex, colValue, value) {
    if (!interactive()) return
    const next = [...modelValue.value]
    while (next.length <= rowIndex) next.push({})
    next[rowIndex] = { ...(next[rowIndex] || {}), [colValue]: value }
    modelValue.value = next
  }

  function handleValueChange(rowIndex, colValue, value) {
    if (hasUniformInputType.value) {
      setSimple(rowIndex, value)
    } else {
      setNested(rowIndex, colValue, value)
    }
  }

  return {
    hasUniformInputType,
    getRowValue,
    getCellValue,
    getValue,
    isCellSelected,
    handleValueChange,
  }
}
