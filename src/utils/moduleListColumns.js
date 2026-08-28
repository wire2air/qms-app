// Configurable record-list columns for promoted form modules (user 2026-08-28).
//
// The module author picks which form fields appear as table columns
// (moduleConfig.listColumns, ordered field names). Only field types whose
// values render and filter sanely in a cell qualify — scalars, choices,
// dates and entity lookups. Layout nodes, long-form text, tables/repeaters,
// files and signatures don't.
//
// The list page turns each pick into a DataTable column: the cell value comes
// straight off record.payload[name] (module payloads are flat by field name),
// lookups resolve UUID → display name, and the column's filterType follows the
// kind — so the configured columns filter exactly like CAPA/NC's do.
import { LOOKUP_ENTITY_BY_VALUE } from '@/constants/formBuilderConfig.js'

/** form field type → column kind (also the filterType family). */
const COLUMN_KINDS = {
  input: 'string',
  text: 'string',
  email: 'string',
  phone: 'string',
  url: 'string',
  number: 'number',
  currency: 'number',
  date: 'date',
  datetime: 'date',
  select: 'enum',
  dropdown: 'enum',
  radio: 'enum',
  multiselect: 'enum',
  checkbox: 'boolean',
  switch: 'boolean',
  toggle: 'boolean',
  lookup: 'lookup',
}

// Containers whose CHILDREN hold their own scalar fields worth offering.
const DESCEND_TYPES = new Set(['section', 'row', 'column'])

/**
 * Flat list of column-eligible fields from a template schema, document order:
 * [{ name, label, kind, options?, lookupEntity? }].
 * Fields inside repeaters/input tables/checklists are rows-within-a-cell —
 * never offered.
 */
export function eligibleListFields(schema) {
  const out = []
  const walk = (nodes) => {
    for (const n of nodes || []) {
      const kind = COLUMN_KINDS[n?.type]
      if (kind && n?.name) {
        const field = { name: n.name, label: n.label || n.name, kind }
        if (kind === 'enum' && Array.isArray(n.options) && n.options.length) {
          field.options = n.options.map(normalizeOption)
        }
        if (kind === 'lookup' && n.lookupEntity && LOOKUP_ENTITY_BY_VALUE[n.lookupEntity]) {
          field.lookupEntity = n.lookupEntity
        }
        out.push(field)
      }
      if (DESCEND_TYPES.has(n?.type) && Array.isArray(n?.children)) walk(n.children)
    }
  }
  walk(schema || [])
  return out
}

function normalizeOption(o) {
  if (o && typeof o === 'object') {
    const value = o.value ?? o.id ?? o.label ?? o.name
    return { value, label: o.label ?? o.name ?? String(value) }
  }
  return { value: o, label: String(o) }
}

/** The configured picks resolved against the schema, in configured order. */
export function selectedListFields(schema, listColumns) {
  if (!listColumns?.length) return []
  const byName = new Map(eligibleListFields(schema).map((f) => [f.name, f]))
  return listColumns.map((name) => byName.get(name)).filter(Boolean)
}
