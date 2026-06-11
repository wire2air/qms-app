/**
 * Helpers for turning a log book's form schema into table columns and
 * payload values into printable cells.
 *
 * The form schema is the same JSON the Form Builder produces — a tree
 * of fields where layout nodes (section / row / column / repeater)
 * contain children. We walk it and yield only the scalar leaf fields:
 * the ones whose value renders cleanly as a single line of text or a
 * comma-joined list.
 *
 * Complex types (file, photo, repeater, inputTable, rca,
 * riskAssessment, textEditor, password) are deliberately skipped —
 * trying to squeeze a file upload or a Five-Why tree into a table cell
 * would either be useless or actively misleading. They stay in the
 * detail preview where they have room.
 *
 * Used by:
 *   - FieldRecordsList.vue — column rendering when a single log book is
 *     selected
 *   - FieldRecordPreview.vue — printable summary
 *   - logBookExport.js — CSV / printable-HTML generators
 */

/** Field types whose value is safe to flatten into a single table cell. */
const SCALAR_TYPES = new Set([
  'input',
  'textarea',
  'number',
  'select',
  'optionGroup',
  'checkbox',
  'checklist',
  'datetime',
  'rating',
  'slider',
  'toggle',
  'colorPicker',
])

/** Field types that have children we should recurse into. */
const CONTAINER_TYPES = new Set(['section', 'row', 'column'])

/** Layout-only types that have no value of their own and no flat children. */
const LAYOUT_ONLY_TYPES = new Set(['separator', 'instructions'])

/**
 * Walk the schema and return a flat array of scalar fields, in the
 * order they appear. Each entry has at least `{ name, label, type }`
 * and preserves any other props from the schema node (options list,
 * checklist items, etc.) for the formatter.
 *
 * Repeaters are intentionally NOT recursed — their payload is an
 * array of row objects which doesn't flatten into one cell. The
 * repeater's parent name is also skipped (no useful column).
 */
export function flattenScalarFields(schema) {
  if (!Array.isArray(schema)) return []
  const out = []
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (LAYOUT_ONLY_TYPES.has(node.type)) return
    if (CONTAINER_TYPES.has(node.type)) {
      if (Array.isArray(node.children)) node.children.forEach(visit)
      return
    }
    if (SCALAR_TYPES.has(node.type) && node.name) {
      out.push(node)
    }
    // Anything else (file, photo, repeater, inputTable, rca,
    // riskAssessment, textEditor, password, unknown) is intentionally
    // dropped — see file header.
  }
  schema.forEach(visit)
  return out
}

/**
 * Format a payload value for table-cell or CSV display. Returns a
 * single short string. Long text is truncated; arrays of primitives
 * join with ", "; objects fall back to em-dash (shouldn't be reached
 * if the schema was filtered through flattenScalarFields first, but
 * defensive against payload drift).
 */
export function formatCellValue(field, value, { maxLength = 80, dash = '—' } = {}) {
  if (value == null || value === '') return dash

  // Toggle / checkbox-single → boolean
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  // Datetime — accept luxon DateTime, Date, or ISO string.
  if (field?.type === 'datetime') {
    if (value?.toFormat) return value.toFormat('LLL d, yyyy HH:mm')
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toLocaleString()
    return String(value)
  }

  // Select / optionGroup: value may be the option's id; if the field
  // carries an options array with id+label, prefer the label so the
  // cell reads like the form looked, not like raw stored data.
  if ((field?.type === 'select' || field?.type === 'optionGroup') && Array.isArray(field.options)) {
    const match = field.options.find(
      (o) => o?.id === value || o?.value === value || o === value,
    )
    if (match && typeof match === 'object') return match.label ?? match.name ?? String(value)
  }

  // Arrays of primitives (checklist, multi-select, multi-checkbox).
  if (Array.isArray(value)) {
    if (value.length === 0) return dash
    const allPrimitive = value.every(
      (v) => typeof v !== 'object' || v == null,
    )
    if (allPrimitive) {
      const text = value.join(', ')
      return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text
    }
    // Array of objects → can't flatten, defer to detail view.
    return dash
  }

  // Numbers + dates already covered above; everything else stringifies.
  if (typeof value === 'object') return dash
  const s = String(value)
  return s.length > maxLength ? s.slice(0, maxLength - 1) + '…' : s
}

/**
 * Suggest a sensible default visible-column set. First N scalar fields
 * (skipping any obviously-noise types like color pickers). Anything
 * past N is hidden by default but the user can toggle it on via the
 * column picker.
 */
export function defaultVisibleColumnKeys(scalarFields, n = 4) {
  const preferred = scalarFields.filter((f) => f.type !== 'colorPicker')
  return preferred.slice(0, n).map((f) => f.name)
}

/**
 * Display label for a field_records.status_id. The DB stays on the raw
 * enum (LOCKED is still LOCKED on the row) — this only changes what
 * the user sees: "LOCKED" reads to floor users as "the system did
 * something" while "COMPLETED" matches what they actually finished.
 * Other statuses are normalised so "UNDER_REVIEW" reads as "Under
 * review" rather than "UNDER REVIEW".
 */
export function fieldRecordStatusLabel(statusId) {
  if (!statusId) return '—'
  if (statusId === 'LOCKED') return 'Completed'
  return statusId.charAt(0) + statusId.slice(1).toLowerCase().replace(/_/g, ' ')
}
