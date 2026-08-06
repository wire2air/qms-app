/**
 * Hydration helpers for AI-generated form/checklist structure.
 *
 * The AI tasks (`checklist.generate_matrix`, `form.generate_schema`,
 * `workflow.generate_template`) return lightweight descriptors — the frontend
 * rebuilds real, valid builder objects from them so a bad AI response can never
 * produce a malformed schema. These helpers are shared by
 * `useFormBuilder.applyAiSchema` (whole form), `ChecklistBuilderCard` (single
 * checklist field) and `WorkflowAiGenerateDialog` (per-step forms) so the
 * hydration logic lives in exactly one place.
 */
import { FIELD_TYPES_CONFIG, FIELD_TYPES, FIELD_WIDTHS } from '@/constants/formBuilderConfig'

const VALID_WIDTHS = new Set(FIELD_WIDTHS.map((w) => w.value))

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

// ---------------------------------------------------------------------------
// Whole-schema hydration (moved out of useFormBuilder so non-builder hosts —
// e.g. the workflow AI generator building per-step formSchemas — can reuse it).
// ---------------------------------------------------------------------------

/** Get the structurally-valid factory default config for a field type. */
export function getDefaultFieldConfig(type) {
  const typeConfig = FIELD_TYPES_CONFIG[type]

  // Deep clone to avoid shared references for arrays/objects (e.g. options, children)
  return JSON.parse(
    JSON.stringify({
      type,
      ...FIELD_TYPES_CONFIG.base,
      ...typeConfig,
    }),
  )
}

/** Does any field (recursively) already use this name? */
export function fieldNameExists(fields, targetName) {
  for (const field of fields) {
    if (field.name === targetName) return true
    if (field.children && fieldNameExists(field.children, targetName)) return true
    if (field.template && fieldNameExists(field.template, targetName)) return true
  }
  return false
}

/** Generate a unique field name within a schema tree. */
export function generateFieldName(type, existingFields) {
  const baseName = type.toLowerCase()
  let counter = 1
  let name = `${baseName}_${counter}`
  while (fieldNameExists(existingFields, name)) {
    counter++
    name = `${baseName}_${counter}`
  }
  return name
}

/**
 * Build one real builder field from an AI descriptor. Everything starts from
 * the type's real factory default (getDefaultFieldConfig) so the result is
 * always structurally valid; the AI only supplies label + a few hints.
 * `existingRoot` is the schema being assembled, used for globally-unique names.
 */
export function hydrateAiField(node, existingRoot) {
  const type = node && FIELD_TYPES[node.type] ? node.type : 'input'
  const config = getDefaultFieldConfig(type)
  // Preserve a stable name the AI echoed back (EDIT mode) when it's free;
  // otherwise mint a fresh unique one. Keeping the name means answers bound to
  // a retyped field don't orphan.
  const desiredName = typeof node.name === 'string' && node.name.trim() ? node.name.trim() : null
  config.name =
    desiredName && !fieldNameExists(existingRoot, desiredName)
      ? desiredName
      : generateFieldName(type, existingRoot)
  if (typeof node.label === 'string' && node.label.trim()) config.label = node.label.trim()
  if (typeof node.required === 'boolean') config.required = node.required
  if (typeof node.placeholder === 'string') config.placeholder = node.placeholder
  if (typeof node.hint === 'string') config.hint = node.hint
  if (typeof node.width === 'string' && VALID_WIDTHS.has(node.width)) config.width = node.width
  // Numeric bounds (number/slider) — the builder's config already carries
  // min/max/step defaults; the AI contract can now express a range.
  if (Number.isFinite(node.min)) config.min = node.min
  if (Number.isFinite(node.max)) config.max = node.max

  // Type-specific payloads.
  if (['select', 'optionGroup', 'checkbox'].includes(type) && Array.isArray(node.options)) {
    const opts = node.options.filter((o) => typeof o === 'string' && o.trim()).map((o) => o.trim())
    if (opts.length) config.options = opts
  }
  if (type === 'checklist') {
    const rows = hydrateChecklistRows(node.rows)
    const columns = hydrateChecklistColumns(node.columns)
    if (rows.length) config.rows = rows
    if (columns.length) config.columns = columns
  }
  if (type === 'header' && config.label) config.text = config.label
  if (type === 'instructions' && typeof node.content === 'string' && node.content.trim()) {
    const c = node.content.trim()
    config.html = /^\s*</.test(c) ? c : `<p>${c}</p>`
  }
  return config
}

/**
 * Hydrate a flat AI descriptor list into a full builder schema tree. Fields
 * carrying a shared `section` label are grouped into real `section` containers
 * (in first-appearance order); ungrouped fields sit at the top level.
 * `buildField(node, rootSoFar)` may be overridden (useFormBuilder passes an
 * edit-aware builder that preserves existing fields by name).
 */
export function hydrateAiFields(fields, { buildField = hydrateAiField } = {}) {
  const newSchema = []
  const sectionContainers = new Map()

  for (const node of fields || []) {
    if (!node || typeof node !== 'object') continue
    const sectionLabel =
      typeof node.section === 'string' && node.section.trim() ? node.section.trim() : null

    const built = buildField(node, newSchema)

    if (sectionLabel) {
      let container = sectionContainers.get(sectionLabel)
      if (!container) {
        container = getDefaultFieldConfig('section')
        container.name = generateFieldName('section', newSchema)
        container.label = sectionLabel
        container.children = []
        sectionContainers.set(sectionLabel, container)
        newSchema.push(container)
      }
      container.children.push(built)
    } else {
      newSchema.push(built)
    }
  }

  return newSchema
}
