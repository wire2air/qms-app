/**
 * Hydration helpers for AI-generated form/checklist structure.
 *
 * The AI tasks (`checklist.generate_matrix`, `form.generate_schema`) return
 * lightweight descriptors — the frontend rebuilds real, valid builder objects
 * from them so a bad AI response can never produce a malformed schema. These
 * helpers are shared by `useFormBuilder.applyAiSchema` (whole form) and
 * `ChecklistBuilderCard` (single checklist field) so the column-value logic
 * lives in exactly one place.
 */

// Same camelCase key derivation the manual checklist column editor uses
// (ConfigChecklist.vue) so AI-authored columns get identical, stable values.
export function toChecklistColumnValue(label) {
  return String(label || '')
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (w, i) => (i === 0 ? w.toLowerCase() : w.toUpperCase()))
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
}

const CHECKLIST_COLUMN_TYPES = new Set([
  'radio',
  'checkbox',
  'text',
  'number',
  'select',
  'date',
  'time',
])

/**
 * Turn AI column descriptors `[{ label, inputType, options? }]` into the
 * builder's stored column shape `[{ label, value, inputType, options? }]`,
 * deriving a UNIQUE camelCase `value` per column (dedupes with _1, _2, …).
 * Unknown inputTypes fall back to 'radio'.
 */
export function hydrateChecklistColumns(aiColumns) {
  const out = []
  const usedValues = []
  for (const col of aiColumns || []) {
    if (!col || typeof col.label !== 'string' || !col.label.trim()) continue
    const label = col.label.trim()
    const inputType = CHECKLIST_COLUMN_TYPES.has(col.inputType) ? col.inputType : 'radio'
    const base = toChecklistColumnValue(label) || 'col'
    let value = base
    let n = 1
    while (usedValues.includes(value)) value = `${base}_${n++}`
    usedValues.push(value)
    const built = { label, value, inputType }
    if (inputType === 'select') {
      built.options = Array.isArray(col.options)
        ? col.options.filter((o) => typeof o === 'string' && o.trim()).map((o) => o.trim())
        : []
    }
    out.push(built)
  }
  return out
}

/** Clean AI row labels into the checklist `rows` string array. */
export function hydrateChecklistRows(aiRows) {
  return (aiRows || []).filter((r) => typeof r === 'string' && r.trim()).map((r) => r.trim())
}
