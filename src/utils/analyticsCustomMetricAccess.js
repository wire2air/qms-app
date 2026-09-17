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
 * Adverbs for the grain, because the sentence needs "reported monthly" rather
 * than "reported Monthly" — GRAIN_OPTIONS holds the label for a dropdown, which
 * is a different job.
 */
const GRAIN_SENTENCE = {
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
  quarter: 'quarterly',
  year: 'yearly',
}

/**
 * The sentence the compiler WILL write, shown before the save that writes it.
 *
 * ── WHY THIS MIRRORS THE COMPILER INSTEAD OF READING BETTER ────────────────
 * analytics_compile_custom_metric() already generates a calculation_note, and
 * that note is what appears next to the figure on every tile, report section and
 * alert from then on. If this helper phrased the same definition differently, a
 * user would read one sentence while building and a permanently different one
 * afterwards — and the mismatch would look like a bug in whichever they saw
 * second. So the clause ORDER below is the compiler's, not a nicer one:
 *
 *     <measure> [where <conditions>], counted by <date> [, grouped by <dims>]
 *
 * with the grain appended, which the compiler's note omits because grain is a
 * column on the row rather than part of the definition it reads.
 *
 * It follows that "Counts records where Status is Open" is deliberate, and
 * "Counts open CAPAs" — which reads better — is deliberately not attempted.
 * Producing that would mean inflecting a module noun and folding a filter into
 * an adjective, correctly, for arbitrary registry fields. The compiler does not
 * try, and a prettier sentence here would only be one that disagrees.
 *
 * ── WHAT IT REFUSES TO DESCRIBE ────────────────────────────────────────────
 * A ratio's numerator. The compiler does not describe it either — a percentage's
 * note reads "The share of records where <shared filters>" and the numerator
 * predicate appears in no prose anywhere in the product. Inventing a description
 * here would be this helper claiming knowledge nothing else has.
 *
 * Returns null rather than a guess whenever a piece is missing or a field is not
 * in the registry, so the caller can stay silent instead of printing half a
 * sentence that changes meaning on the next keystroke.
 *
 * @param {object} definition The in-progress definition.
 * @param {{ grain?: string }} meta
 * @param {Array} fields Registry rows for the CURRENT module and source table.
 * @returns {string|null}
 */
export function definitionSentence(definition, meta = {}, fields = []) {
  if (!definition?.sourceTable || !definition?.timeField) return null

  function labelOf(column) {
    return fields.find((f) => f.columnName === column)?.label ?? null
  }

  const timeLabel = labelOf(definition.timeField)
  if (!timeLabel) return null

  const type = definition.measure?.type ?? MEASURES.COUNT
  const needsField = [MEASURES.SUM, MEASURES.AVG, MEASURES.COUNT_DISTINCT].includes(type)
  if (needsField && !labelOf(definition.measure?.field)) return null

  // The same wording as the compiler's CASE, including "The share of records".
  const OPENING = {
    [MEASURES.COUNT]: 'Counts records',
    [MEASURES.COUNT_DISTINCT]: 'Counts distinct values',
    [MEASURES.SUM]: 'Adds up values',
    [MEASURES.AVG]: 'Averages values',
    [MEASURES.RATIO]: 'The share of records',
  }
  let sentence = OPENING[type]
  if (!sentence) return null

  // Joined with "and", matching array_to_string(v_notes, ' and '). Never "or",
  // and never nested: the compiler joins predicates with AND and there is no
  // way for a definition to express anything else.
  const notes = []
  for (const f of definition.filters ?? []) {
    const label = labelOf(f.field)
    if (!label) return null
    if (f.op === 'isNull') {
      notes.push(`${label} is not set`)
    } else if (f.op === 'isNotNull') {
      notes.push(`${label} is set`)
    } else {
      const values = f.values ?? []
      if (!values.length) return null
      notes.push(`${label} is ${f.op === 'notIn' ? 'not ' : ''}${values.map(humaniseCode).join(' or ')}`)
    }
  }
  if (notes.length) sentence += ` where ${notes.join(' and ')}`

  // The label as written, not lowercased — the same reasoning the compiler
  // records: the registry says "Last reviewed" and "Raised", and lowercasing
  // produced "counted by raised", which reads like a typo.
  sentence += `, counted by ${timeLabel}`

  const groups = []
  for (const column of definition.groupBy ?? []) {
    const label = labelOf(column)
    if (!label) return null
    groups.push(label)
  }
  if (groups.length) sentence += `, grouped by ${groups.join(' and ')}`

  const grain = GRAIN_SENTENCE[meta.grain ?? 'month']
  if (grain) sentence += `, reported ${grain}`

  return `${sentence}.`
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
