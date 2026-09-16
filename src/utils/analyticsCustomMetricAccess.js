/**
 * Custom metrics — the client-side shape of a definition, and who may write one.
 *
 * ── THIS IS NOT THE ENFORCEMENT, AND HERE THAT IS UNUSUALLY LITERAL ─────────
 * Elsewhere in analytics a helper like this mirrors an RLS policy so the app does
 * not draw a button that 403s. That is true here too, but there is a second,
 * stronger backstop: nothing this file produces is trusted by the server. The
 * definition is re-validated field by field against analytics_module_fields by
 * analytics_compile_custom_metric(), and a name that is not in the registry is
 * REJECTED rather than escaped. So a bug here is a usability bug, never a
 * security one — which is exactly the property the whole design was built for.
 *
 * ── WHY VALIDATION IS DUPLICATED AT ALL ─────────────────────────────────────
 * Because "save, wait, read compile_error" is a poor way to learn that a
 * percentage needs a numerator. The checks below exist to say so BEFORE the round
 * trip. They are deliberately a SUBSET of the compiler's — never a reimplementation
 * of them — so the two cannot disagree about whether something is legal. When
 * they differ, the server wins and its message is what the user sees.
 */

/** The measurements a definition may ask for. */
export const MEASURES = {
  COUNT: 'count',
  COUNT_DISTINCT: 'countDistinct',
  SUM: 'sum',
  AVG: 'avg',
  RATIO: 'ratio',
}

export const MEASURE_OPTIONS = [
  {
    value: MEASURES.COUNT,
    label: 'Count of records',
    description: 'How many there are. The usual starting point.',
  },
  {
    value: MEASURES.RATIO,
    label: 'Percentage',
    description: 'What share of them meet a condition — closed on time, verified, and so on.',
  },
  {
    value: MEASURES.COUNT_DISTINCT,
    label: 'Count of distinct values',
    description: 'How many different sites, owners or suppliers appear.',
  },
  { value: MEASURES.SUM, label: 'Sum of a number', description: 'Adds a numeric field up.' },
  {
    value: MEASURES.AVG,
    label: 'Average of a number',
    description: 'The mean of a numeric field.',
  },
]

/**
 * Comparisons a filter may use.
 *
 * A deliberately short list. Every one of these compiles to a predicate the
 * compiler already knows; offering something it does not (LIKE, BETWEEN, a
 * subquery) would produce a save that always fails, which is worse than not
 * offering it.
 */
export const OP_OPTIONS = [
  { value: 'in', label: 'is one of' },
  { value: 'notIn', label: 'is not one of' },
  { value: 'isNotNull', label: 'is set' },
  { value: 'isNull', label: 'is not set' },
]

/** Ops that need no value — the value input is hidden for these. */
export const VALUELESS_OPS = ['isNull', 'isNotNull']

export const DIRECTION_OPTIONS = [
  { value: 'neutral', label: 'Neither — just report it' },
  { value: 'higher_is_better', label: 'Higher is better' },
  { value: 'lower_is_better', label: 'Lower is better' },
]

export const GRAIN_OPTIONS = [
  { value: 'month', label: 'Monthly' },
  { value: 'week', label: 'Weekly' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'day', label: 'Daily' },
  { value: 'year', label: 'Yearly' },
]

/** An empty definition, in the shape the compiler reads. */
export function blankDefinition() {
  return {
    sourceTable: null,
    timeField: null,
    measure: { type: MEASURES.COUNT },
    filters: [],
    groupBy: [],
  }
}

/** One empty filter row. */
export function blankFilter() {
  return { field: null, op: 'in', values: [] }
}

/**
 * Who may create or change one.
 *
 * Mirrors analytics_custom_metrics_{insert,update,delete}_rls, which gate on
 * `reports_dashboards:manage` (or company ownership, which isAllowed already
 * folds in) and NOT on per-row authorship — unlike dashboards and reports, a
 * custom metric has no owner column. Anyone with manage may edit anyone's.
 *
 * @param {{ canManage?: boolean }} viewer
 */
export function canManageCustomMetrics({ canManage = false } = {}) {
  return !!canManage
}

/**
 * Turn a stored code into something readable.
 *
 * The same treatment `segmentLabel()` gives a breakdown value and the compiler
 * gives a calculation note. Duplicated in three places now, and deliberately: a
 * SQL function, a Vue component and this each need it at a point the others
 * cannot reach. They are held together by the tests that pin the wording, not by
 * a shared import that would have to cross the database boundary.
 */
export function humaniseCode(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (!/^[A-Z0-9]+(_[A-Z0-9]+)*$/.test(text)) return text
  const words = text.toLowerCase().split('_').join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The reason a definition cannot be saved yet, or null.
 *
 * Phrased as a sentence a person can act on, and kept to the checks that are
 * unambiguous on the client. Anything subtler — is this column really a number,
 * does this module own that source table — is the compiler's to answer, because
 * only it has the registry.
 *
 * @param {object} definition
 * @param {{ name?: string }} meta
 * @param {number} dimensionCap
 */
export function definitionProblem(definition, meta = {}, dimensionCap = 3) {
  if (!meta.name?.trim()) return 'Give the metric a name.'
  if (!definition?.sourceTable) return 'Choose what this metric counts.'
  if (!definition?.timeField) return 'Choose which date it is counted by.'

  const type = definition.measure?.type ?? MEASURES.COUNT
  if (
    [MEASURES.SUM, MEASURES.AVG, MEASURES.COUNT_DISTINCT].includes(type) &&
    !definition.measure?.field
  ) {
    return 'Choose the field to measure.'
  }
  if (type === MEASURES.RATIO && !(definition.measure?.numerator ?? []).length) {
    return 'A percentage needs a condition for the top of the fraction.'
  }

  for (const f of definition.filters ?? []) {
    if (!f.field) return 'Every filter needs a field.'
    if (!VALUELESS_OPS.includes(f.op) && !(f.values ?? []).length) {
      return 'Every filter needs at least one value.'
    }
  }
  for (const f of definition.measure?.numerator ?? []) {
    if (!f.field) return 'Every condition needs a field.'
    if (!VALUELESS_OPS.includes(f.op) && !(f.values ?? []).length) {
      return 'Every condition needs at least one value.'
    }
  }

  // Checked here as well as server-side because the cap is a property of the
  // ROLLUP (analytics_dimension_capacity), not of this definition — so the
  // number is worth showing before a save rather than after.
  if ((definition.groupBy ?? []).length > dimensionCap) {
    return `A metric can be grouped by at most ${dimensionCap} things.`
  }
  return null
}

// ────────────────────────────────────────────────────────────────────────────
// Plain language
//
// Everything below exists so the builder can talk about a definition the way a
// person would ask for it — "the percentage of CAPAs closed on time, monthly" —
// rather than the way the compiler reads it (source table, time field, grain).
// It is display only: nothing here is written to `definition`, so a wrong label
// is a wrong sentence and never a wrong metric.
// ────────────────────────────────────────────────────────────────────────────

/**
 * What a module's records are CALLED, when the generated title case is wrong.
 *
 * `capas` title-cases to "Capas", and the registry's own slugs are worse
 * ("ncr"). Only the exceptions are listed — anything absent falls back to the
 * derived label, so a module added to the registry reads acceptably with no
 * frontend change, which is the same property the field pickers have.
 */
const RECORD_LABELS = {
  capas: 'CAPAs',
  nonconformances: 'nonconformances',
  documents: 'documents',
}

const MODULE_LABELS = {
  ncr: 'Nonconformances',
  capa: 'CAPA',
  document_control: 'Document control',
}

/** snake_case → Title Case. */
function titleCase(value) {
  return String(value ?? '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** The module's name as the nav shows it. */
export function moduleLabel(id) {
  return MODULE_LABELS[id] ?? titleCase(id)
}

/** What the records are called mid-sentence, e.g. "CAPAs". */
export function recordLabel(sourceTable) {
  return RECORD_LABELS[sourceTable] ?? titleCase(sourceTable).toLowerCase()
}

/** How a grain reads inside a sentence. */
const GRAIN_ADVERB = {
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
  quarter: 'quarterly',
  year: 'yearly',
}

/** camelCase a snake_case identifier — `capa_statuses` → `capaStatuses`. */
function camelise(value) {
  return String(value ?? '').replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
}

/**
 * The SyncEngine model that mirrors a registry `lookupTable`, or null.
 *
 * The registry names a Postgres table; the engine keys its stores by the
 * camelCase store name given to `@ClientModel`. Those two spellings differ by
 * exactly one transformation, so the mapping is derived rather than hand-kept —
 * a hand-kept list would be one more place to forget when a model is added, and
 * every one of the 19 lookup tables in the registry already matches.
 *
 * Read off `Model.schema.tableName` rather than ModelRegistry, because a
 * production build minifies class names: `db` is keyed by the un-minified
 * property name and each class carries its own registered store name, so this
 * resolves identically in dev and prod (the same reasoning `resolveSyncChannel`
 * records in useLiveQuery).
 *
 * @param {Record<string, any>} db
 * @param {string|null} lookupTable
 */
export function lookupModelName(db, lookupTable) {
  if (!lookupTable) return null
  const store = camelise(lookupTable)
  for (const [name, Model] of Object.entries(db ?? {})) {
    try {
      if (Model?.schema?.tableName === store) return name
    } catch {
      // Not a model, or registered without a schema — skip it rather than let
      // one odd export break every picker.
    }
  }
  return null
}

/** The human label of a lookup row, whatever that model calls it. */
export function lookupRowLabel(row) {
  if (!row) return ''
  const direct = row.name ?? row.title ?? row.label
  if (direct) return String(direct)
  const person = [row.firstName, row.lastName].filter(Boolean).join(' ')
  if (person) return person
  return humaniseCode(row.id)
}

/**
 * One condition, in words: "Status is one of Closed or Cancelled".
 *
 * @param {{field: string, op: string, values?: string[]}} filter
 * @param {(column: string) => string} labelOf — column → field label
 * @param {(column: string, value: string) => string} valueOf — column, stored value → label
 */
function conditionSentence(filter, labelOf, valueOf) {
  const field = labelOf(filter.field) || 'a field'
  if (filter.op === 'isNotNull') return `${field} is set`
  if (filter.op === 'isNull') return `${field} is not set`
  const values = (filter.values ?? []).map((v) => valueOf(filter.field, v))
  if (!values.length) return `${field} is …`
  const listed =
    values.length === 1 ? values[0] : `${values.slice(0, -1).join(', ')} or ${values.at(-1)}`
  return filter.op === 'notIn' ? `${field} is not ${listed}` : `${field} is ${listed}`
}

function joinClauses(parts) {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/**
 * The whole definition as a sentence a reader can check against what they meant.
 *
 * This is the single piece of the builder that answers "did I build the thing I
 * was asked for" — every other control answers a question about the metric one
 * field at a time. Returns null while the definition is too incomplete to
 * describe, so the caller can simply hide the summary rather than print a
 * half-sentence that changes under the user's cursor.
 *
 * @param {object} definition
 * @param {{grain?: string, direction?: string}} meta
 * @param {Array<{columnName: string, label: string}>} fields — the fields of the
 *   chosen source table, used for labels only
 * @param {(column: string, value: string) => string} [valueLabel] — resolves a
 *   stored code/uuid to its label; falls back to humanising the code
 */
export function describeDefinition(definition, meta = {}, fields = [], valueLabel = null) {
  if (!definition?.sourceTable || !definition?.timeField) return null

  const labelOf = (column) => fields.find((f) => f.columnName === column)?.label ?? ''
  const valueOf = (column, value) => valueLabel?.(column, value) || humaniseCode(value)
  const records = recordLabel(definition.sourceTable)
  const type = definition.measure?.type ?? MEASURES.COUNT
  const measureField = labelOf(definition.measure?.field) || 'a field'

  let opening
  if (type === MEASURES.RATIO) {
    const numerator = (definition.measure?.numerator ?? []).map((f) =>
      conditionSentence(f, labelOf, valueOf),
    )
    opening = numerator.length
      ? `The percentage of ${records} where ${joinClauses(numerator)}`
      : `A percentage of ${records}`
  } else if (type === MEASURES.SUM) {
    opening = `Adds up ${measureField} across ${records}`
  } else if (type === MEASURES.AVG) {
    opening = `The average ${measureField} across ${records}`
  } else if (type === MEASURES.COUNT_DISTINCT) {
    opening = `How many different ${measureField} values appear across ${records}`
  } else {
    opening = `How many ${records} there are`
  }

  const filters = (definition.filters ?? []).map((f) => conditionSentence(f, labelOf, valueOf))
  const only = filters.length ? `, counting only those where ${joinClauses(filters)}` : ''

  const period = GRAIN_ADVERB[meta.grain ?? 'month'] ?? 'monthly'
  const dated = labelOf(definition.timeField) || 'a date'
  const first = `${opening}${only} — reported ${period}, counted by the ${dated.toLowerCase()} date.`

  const groups = (definition.groupBy ?? []).map((c) => labelOf(c)).filter(Boolean)
  const second = groups.length ? ` It can be broken down by ${joinClauses(groups)}.` : ''

  const third =
    meta.direction === 'higher_is_better'
      ? ' A rising figure is good.'
      : meta.direction === 'lower_is_better'
        ? ' A falling figure is good.'
        : ''

  return `${first}${second}${third}`
}
