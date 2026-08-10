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
 * Complex types (file, photo, signature, repeater, table, richTextAttachment,
 * lookup, password) are deliberately skipped — squeezing a file upload, an
 * entity reference or a Five-Why tree into a table cell would be useless or
 * misleading. They stay in the detail preview where they have room.
 * `textEditor` IS surfaced (stripped + truncated) since it's usually the
 * substantive field people want to scan.
 *
 * Used by:
 *   - FieldRecordsList.vue — column rendering when a single log book is
 *     selected
 *   - FieldRecordPreview.vue — printable summary
 *   - logBookExport.js — CSV / printable-HTML generators
 */

/**
 * Field types whose value is safe to flatten into a single table cell.
 *
 * These are the ACTUAL type identifiers the Form Builder / DynamicForm emit
 * (see DynamicForm.js) — text/date/radio/etc., NOT the generic aliases
 * (input/textarea/datetime) an earlier version guessed at. A mismatch here
 * silently drops every column (the field never matches, so the table shows
 * only the built-in columns). `textEditor` is included even though it's rich
 * HTML — it's usually the substantive field (observations, notes), so we
 * strip tags and truncate it into a preview cell rather than hide it.
 */
const SCALAR_TYPES = new Set([
  'text',
  'textarea',
  'input', // legacy alias, kept for older schemas
  'number',
  'date',
  'time',
  'datetime',
  'email',
  'phone',
  'select',
  'optionGroup',
  'optionSet',
  'radio',
  'checkbox',
  'checklist',
  'rating',
  'slider',
  'toggle',
  'boolean',
  'colorPicker',
  'textEditor',
])

/** Choice types whose stored value may be an option id we resolve to a label. */
const CHOICE_TYPES = new Set(['select', 'optionGroup', 'optionSet', 'radio'])

/** Date-ish types formatted as a date/time string. */
const DATE_TYPES = new Set(['date', 'time', 'datetime'])

/**
 * Field types that have children we should recurse into. Repeater/table are
 * intentionally NOT here — their payload is an array of rows, not one cell.
 */
const CONTAINER_TYPES = new Set(['section', 'row', 'column'])

/** Layout-only types that have no value of their own and no flat children. */
const LAYOUT_ONLY_TYPES = new Set(['separator', 'instructions', 'header'])

/** Strip HTML tags + decode common entities to a single line of plain text. */
function htmlToText(html) {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

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

  const truncate = (s) => (s.length > maxLength ? s.slice(0, maxLength - 1) + '…' : s)

  // Rich text → strip tags to a single-line preview.
  if (field?.type === 'textEditor') {
    const text = htmlToText(value)
    return text ? truncate(text) : dash
  }

  // Toggle / checkbox-single → boolean
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  // Date/time — accept luxon DateTime, Date, or ISO string.
  if (DATE_TYPES.has(field?.type)) {
    const fmt = field.type === 'time' ? 'HH:mm' : field.type === 'date' ? 'LLL d, yyyy' : 'LLL d, yyyy HH:mm'
    if (value?.toFormat) return value.toFormat(fmt)
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) {
      return field.type === 'date' ? d.toLocaleDateString() : d.toLocaleString()
    }
    return String(value)
  }

  // Choice fields (select / optionGroup / optionSet / radio): the stored value
  // may be the option's id; if the field carries an options array with
  // id+label, prefer the label so the cell reads like the form looked. Handles
  // both a scalar value and an array of selected values.
  if (CHOICE_TYPES.has(field?.type) && Array.isArray(field.options)) {
    const labelFor = (v) => {
      const match = field.options.find((o) => o?.id === v || o?.value === v || o === v)
      return match && typeof match === 'object' ? (match.label ?? match.name ?? String(v)) : String(v)
    }
    if (Array.isArray(value)) return value.length ? truncate(value.map(labelFor).join(', ')) : dash
    return truncate(labelFor(value))
  }

  // Arrays of primitives (checklist, multi-select, multi-checkbox).
  if (Array.isArray(value)) {
    if (value.length === 0) return dash
    const allPrimitive = value.every((v) => typeof v !== 'object' || v == null)
    if (allPrimitive) return truncate(value.join(', '))
    // Array of objects → can't flatten, defer to detail view.
    return dash
  }

  // Numbers already covered above; everything else stringifies.
  if (typeof value === 'object') return dash
  return truncate(String(value))
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
