import { computed } from 'vue'

/**
 * useChecklistModel — the value-shape state machine behind BaseChecklist,
 * extracted so it's unit-testable in isolation (it used to live inline in a
 * 300-line component and was effectively unmountable to test — audit §7).
 *
 * BaseChecklist stores one of two model shapes depending on the columns:
 *   - UNIFORM (all columns share one inputType): a FLAT array, one value per
 *     row    → modelValue[rowIndex]
 *   - MIXED (columns have different inputTypes): an array of OBJECTS keyed by
 *     the column value → modelValue[rowIndex][colValue]
 *
 * @param {import('vue').Ref<Array>} modelValue  the v-model ref (mutated in place by a fresh array)
 * @param {() => Array | import('vue').Ref<Array>} columns  the column defs (getter or ref)
 * @param {{ interactive?: () => boolean }} [opts]  interactive() gates writes (disabled/readonly)
 */
export function useChecklistModel(modelValue, columns, opts = {}) {
  const interactive = opts.interactive ?? (() => true)
  const readColumns = () => (typeof columns === 'function' ? columns() : (columns?.value ?? [])) || []

  // Uniform when every column shares the same inputType (radio is the default).
  const hasUniformInputType = computed(() => {
    const cols = readColumns()
    if (cols.length === 0) return true
    const first = cols[0].inputType || 'radio'
    return cols.every((col) => (col.inputType || 'radio') === first)
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
