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
  { value: MEASURES.AVG, label: 'Average of a number', description: 'The mean of a numeric field.' },
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
  if ([MEASURES.SUM, MEASURES.AVG, MEASURES.COUNT_DISTINCT].includes(type) && !definition.measure?.field) {
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
