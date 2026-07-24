/**
 * Line-clearance checklist completeness check.
 *
 * A `checklist` field validates as `required` only when the array is non-empty
 * (i.e. a single row answered), so it can't enforce "answer every question".
 * This walks each checklist field and returns the labels of rows whose answer
 * column (the first non-free-text column, e.g. the Yes/No/N/A radio) is blank.
 */
const FREE_TEXT_INPUTS = ['text', 'number', 'date', 'time']

export function unansweredClearanceRows(schema, payload) {
  const missing = []
  for (const field of schema || []) {
    if (field.type !== 'checklist') continue
    const cols = field.columns || []
    const answerCol = cols.find((c) => !FREE_TEXT_INPUTS.includes(c.inputType || 'radio'))
    const key = answerCol?.value
    const data = (payload && payload[field.name]) || []
    ;(field.rows || []).forEach((row, i) => {
      const cell = data[i]
      const val = key && cell && typeof cell === 'object' ? cell[key] : cell
      if (val == null || val === '') missing.push(typeof row === 'string' ? row : row.label || `Item ${i + 1}`)
    })
  }
  return missing
}
