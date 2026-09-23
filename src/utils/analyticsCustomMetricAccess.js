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

/**
 * What the builder offers.
 *
 * ── countDistinct IS DELIBERATELY ABSENT ────────────────────────────────────
 * "How many different suppliers" is a question people genuinely want, and it is
 * not offered because the storage cannot answer it honestly. Figures are rolled
 * up per period/scope bucket and added together at read time, and
 * COUNT(DISTINCT x) does not survive that: a supplier appearing in all twelve
 * months contributes twelve, not one. There is no arrangement of numerator and
 * denominator that fixes it — it needs the raw rows at read time (which defeats
 * the rollup) or an HLL sketch (which the rollup has no column for).
 *
 * The compiler REFUSES it as of migration 20260917240000, so leaving it here
 * would offer a choice that fails on Save. Removed from the menu instead, and
 * the compiler's refusal remains as the backstop for a definition written by
 * any other path.
 */
export const MEASURE_OPTIONS = [
  {
    value: MEASURES.COUNT,
    label: 'Number of records',
    description: 'How many there are. The usual starting point.',
  },
  {
    value: MEASURES.RATIO,
    label: 'Percentage',
    description: 'What share of them meet a condition — closed on time, verified, and so on.',
  },
  { value: MEASURES.SUM, label: 'Total', description: 'Adds a number field up.' },
  { value: MEASURES.AVG, label: 'Average', description: 'The average of a number field.' },
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
 * Who may create / change / delete one — now three separate questions.
 *
 * Mirrors analytics_custom_metrics_{insert,update,delete}_rls, which since the
 * 2026-09-21 permission split gate on `analytics_metrics:create` / `:update` /
 * `:delete` respectively, instead of the one coarse `reports_dashboards:manage`
 * they all shared before. Company ownership still short-circuits every one of
 * them, which `isAllowed` already folds in.
 *
 * Still NOT per-row authorship: unlike dashboards and reports, a custom metric
 * has no owner column, so whoever holds the verb may act on anyone's. The split
 * is about WHICH VERB, not whose row.
 *
 * Kept as three one-line functions rather than one taking an action string:
 * every call site then names the verb it means at the point of use, and a
 * missing case is a missing import rather than a typo'd argument that silently
 * returns false.
 *
 * @param {{ canCreate?: boolean }} viewer
 */
export function canCreateCustomMetrics({ canCreate = false } = {}) {
  return !!canCreate
}

/** @param {{ canUpdate?: boolean }} viewer */
export function canUpdateCustomMetrics({ canUpdate = false } = {}) {
  return !!canUpdate
}

/** @param {{ canDelete?: boolean }} viewer */
export function canDeleteCustomMetrics({ canDelete = false } = {}) {
  return !!canDelete
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
 * The reporting keys a custom module's form declares, as picker options.
 *
 * ── WHY THIS IS NOT THE `lookupTable` GAP ───────────────────────────────────
 * The dialog's header calls out that filter VALUES are typed rather than
 * picked, blocked on a missing Postgres-table → SyncEngine-model mapping. That
 * blocker is real for enum and uuid fields, whose values live in a lookup table
 * the client does not mirror.
 *
 * `reporting_key` is not one of those. Its registry row carries NO lookupTable
 * (it is `kind: 'text'`), because its values are not rows anywhere — they are
 * the keys an author typed into the form builder, and they live in
 * `form_templates.schema`, which this client already holds: CustomMetricsHome
 * reads FormTemplate to decide which modules are the tenant's own. So the
 * picker is buildable today, from data already in memory, with no new endpoint.
 *
 * Worth doing rather than cosmetic: a metric on this source is WRONG without a
 * reporting_key filter — analytics_field_values holds one row per (record,
 * field), so an unfiltered metric mixes every field together. Making the author
 * type a key they have to remember exactly, when a typo compiles cleanly and
 * yields an empty series, is the usability half of a correctness problem.
 *
 * @param {object[]} templates FormTemplate rows (needs isModule, internalName, schema)
 * @param {string} moduleId the custom module key, e.g. 'lead_crm'
 * @returns {{value: string, label: string}[]} one option per reportable field
 */
export function reportingKeyOptions(templates, moduleId) {
  if (!moduleId) return []
  const template = (Array.isArray(templates) ? templates : []).find(
    (t) => t?.isModule && t?.internalName === moduleId,
  )
  if (!template) return []

  const out = []
  const seen = new Set()
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node.children)) {
      node.children.forEach(visit)
      return
    }
    const key = node.reporting?.enabled && node.reporting?.key?.trim()
    if (!key || seen.has(key)) return
    seen.add(key)
    // Label first, key second: the author knows the field by the label they
    // gave it, but the key is what the metric stores and what a stale
    // definition would show, so hiding it would make a mismatch unreadable.
    out.push({ value: key, label: node.label ? `${node.label} (${key})` : key })
  }
  ;(Array.isArray(template.schema) ? template.schema : []).forEach(visit)
  return out.sort((a, b) => a.label.localeCompare(b.label))
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

  // Mirrors the compiler's refusal for the EAV source, so the author is stopped
  // by the form rather than by a compile error after saving. Every numeric
  // answer on a custom module shares one column, so a sum or average that does
  // not name its field silently aggregates all of them — and it only starts
  // being wrong when a SECOND number is marked reportable, long after the
  // metric was written.
  //
  // Two shapes are safe, matching the compiler exactly: ONE field pinned by an
  // 'in' filter, or a breakdown BY field, which gives each one its own series
  // so nothing is ever added across two. Keep both arms in step with
  // analytics_compile_custom_metric — a client that refuses what the server
  // accepts is a form nobody can get past.
  if (
    definition.sourceTable === 'analytics_field_values' &&
    [MEASURES.SUM, MEASURES.AVG].includes(type) &&
    !(definition.filters ?? []).some(
      (f) => f.field === 'reporting_key' && (f.op ?? 'in') === 'in' && (f.values ?? []).length === 1,
    ) &&
    !(definition.groupBy ?? []).includes('reporting_key')
  ) {
    return 'Choose which answer to measure, or break the results down by Field.'
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

/**
 * The four states a saved metric can be in, and the order a list shows them in.
 *
 * ── WHY THIS IS A FUNCTION AND NOT A `status` COLUMN ───────────────────────
 * Because three of the four are not stored anywhere. `isPublished` and
 * `compileError` are columns; "preparing" is the ABSENCE of a catalog row for a
 * published metric, which lives in a server-computed aggregate that is never
 * written to IndexedDB (CLAUDE.md rule #4). So the state is necessarily derived
 * at read time from two sources that cannot be joined in a query.
 *
 * ── THE PRECEDENCE IS THE BADGE'S, AND MUST STAY THAT WAY ──────────────────
 * compileError wins over everything: a metric that did not compile has no
 * metric behind it, so asking whether it is published is meaningless. Then
 * "preparing", then published/draft. This mirrors the v-if chain the card
 * renders — and that is the point of extracting it. A filter that classified a
 * row differently from the badge next to it would be a list that appears to
 * show the wrong cards, which is far more confusing than no filter at all.
 *
 * `catalogRow` is passed rather than looked up because the catalog is a
 * server-computed aggregate the caller already holds; re-deriving it here would
 * either duplicate `metricKeyOf` or take a dependency on useMetricCatalog from
 * a pure module.
 *
 * @param {{ isPublished?: boolean, compileError?: string|null }} metric
 * @param {boolean} hasCatalogRow Whether the rollup has computed this metric yet.
 * @returns {'error'|'preparing'|'published'|'draft'}
 */
export function metricState(metric, hasCatalogRow) {
  if (metric?.compileError) return 'error'
  if (metric?.isPublished && !hasCatalogRow) return 'preparing'
  return metric?.isPublished ? 'published' : 'draft'
}

/**
 * Status filter options, in the order a reader scans for trouble.
 *
 * "Needs attention" first because it is the only state that requires an action,
 * and a list of seven metrics with one broken is the case this filter exists
 * for. The rest follow the lifecycle.
 */
export const METRIC_STATE_OPTIONS = [
  { value: 'error', label: 'Needs attention' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
]

/** Sorts the list offers. Name is the default — it is the only stable one. */
export const METRIC_SORT_OPTIONS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'module', label: 'Module' },
  { value: 'status', label: 'Status' },
]

/**
 * Rank for the 'status' sort, matching METRIC_STATE_OPTIONS.
 *
 * Sorting by status means "show me what needs looking at first", so it is the
 * same order, not alphabetical — "Draft, Needs attention, Preparing, Published"
 * would bury the one row that matters.
 */
const STATE_RANK = { error: 0, preparing: 1, published: 2, draft: 3 }

export function metricStateRank(state) {
  return STATE_RANK[state] ?? 99
}

/**
 * The sections of the builder, in the order the form asks them.
 *
 * Ids rather than indices so a section can be inserted without renumbering
 * every reference, and so `problemSection()` can name one in a way that reads
 * at the call site.
 */
export const BUILDER_SECTIONS = {
  WHAT: 'what',
  RECORDS: 'records',
  FILTERS: 'filters',
  WHEN: 'when',
  BREAKDOWN: 'breakdown',
}

/**
 * Which section a save-blocking problem belongs to.
 *
 * ── WHY THIS IS SEPARATE FROM definitionProblem ────────────────────────────
 * definitionProblem returns the sentence a person reads, and twenty tests pin
 * that wording. Changing its return shape to carry a section would rewrite all
 * of them for a presentational concern. So the message stays the contract and
 * this maps it to a place.
 *
 * ── WHY IT MATCHES ON THE MESSAGE ──────────────────────────────────────────
 * Which looks fragile, and is the reason the two live in the same file: the
 * strings below are the strings above, and a change to one without the other
 * is visible in one screen. The alternative — re-deriving "is the name empty"
 * here — would be a second implementation of the same checks, free to disagree
 * with the first about whether a form is savable.
 *
 * Returns null for a message it does not recognise, which the caller reads as
 * "show it on the footer only". An unplaced message is a worse outcome than a
 * wrongly-placed one.
 *
 * @param {string|null} problem The sentence from definitionProblem().
 * @returns {string|null} A BUILDER_SECTIONS value, or null.
 */
export function problemSection(problem) {
  if (!problem) return null
  const s = String(problem)
  if (s.startsWith('Give the metric a name')) return BUILDER_SECTIONS.WHAT
  if (s.startsWith('Choose what this metric counts')) return BUILDER_SECTIONS.RECORDS
  if (s.startsWith('Choose which date')) return BUILDER_SECTIONS.WHEN
  if (
    s.startsWith('Choose the field to measure') ||
    s.startsWith('A percentage needs a condition') ||
    s.startsWith('Choose which answer to measure')
  ) {
    return BUILDER_SECTIONS.RECORDS
  }
  if (s.startsWith('Every filter needs') || s.startsWith('Every condition needs')) {
    return BUILDER_SECTIONS.FILTERS
  }
  if (s.startsWith('A metric can be grouped by at most')) return BUILDER_SECTIONS.BREAKDOWN
  return null
}

/**
 * A one-line summary of a completed section, for the collapsed state.
 *
 * ── WHY A SUMMARY AND NOT JUST A TICK ──────────────────────────────────────
 * A collapsed section has to stay auditable. "When ✓" tells the author nothing
 * about the single most consequential choice in the form — a CAPA raised in
 * March and closed in June is a March figure or a June figure depending only on
 * that field. So each summary names the VALUE, not the fact that one was given.
 *
 * Returns null when the section is not yet complete, which the caller reads as
 * "keep it open".
 *
 * @param {string} section A BUILDER_SECTIONS value.
 * @param {object} ctx Labels already resolved by the component, which owns the
 *   registry rows: { name, moduleLabel, recordsLabel, measureLabel,
 *   filterCount, timeLabel, breakdownLabel, grainLabel, directionLabel }.
 * @returns {string|null}
 */
export function sectionSummary(section, ctx = {}) {
  switch (section) {
    case BUILDER_SECTIONS.WHAT:
      if (!ctx.name?.trim()) return null
      return ctx.moduleLabel ? `${ctx.name.trim()} · ${ctx.moduleLabel}` : ctx.name.trim()

    case BUILDER_SECTIONS.RECORDS:
      if (!ctx.recordsLabel || !ctx.measureLabel) return null
      return `${ctx.recordsLabel} · ${ctx.measureLabel}`

    case BUILDER_SECTIONS.FILTERS: {
      // Zero filters is a complete answer, not a missing one — "every record
      // counts" is what the form says when the list is empty, and collapsing it
      // to nothing would hide a decision the author made.
      const n = ctx.filterCount ?? 0
      if (n === 0) return 'Every record counts'
      return `${n} ${n === 1 ? 'filter' : 'filters'}`
    }

    case BUILDER_SECTIONS.WHEN:
      if (!ctx.timeLabel) return null
      return `Counted by ${ctx.timeLabel}`

    case BUILDER_SECTIONS.BREAKDOWN:
      return ctx.breakdownLabel || 'No breakdown'

    default:
      return null
  }
}

/**
 * What each control becomes in the generated query.
 *
 * ── WHY SQL IS NAMED HERE AND NOWHERE ELSE IN THE FORM ─────────────────────
 * The rest of the dialog deliberately avoids it: the whole design is that an
 * author describes a QUESTION and the server decides how to count it, so
 * labelling a field "GROUP BY" would push the vocabulary back the other way.
 *
 * These live behind an info icon instead, which keeps the default reading
 * business-first while giving the person who builds metrics for a living the
 * one thing the form otherwise hides — what it actually compiles to. That
 * audience is real: somebody has to tell a quality manager why a breakdown by
 * date is refused, and "it is a GROUP BY and dates are unbounded" is the answer.
 *
 * Kept as prose rather than a bare clause name. "GROUP BY" alone tells a
 * developer where it lands but not why the form restricts it, and the
 * restrictions are the part that is surprising.
 */
export const FIELD_HELP = {
  module:
    'Scopes everything below. The module decides which table the metric reads and which columns it may name — the server rejects any field not registered for it, so this is also a security boundary, not just a filter on the pickers.',

  records:
    'The FROM table. Shown only when a module has more than one; today every module has exactly one, so it is normally chosen for you.',

  measure:
    'The SELECT expression. "Number of records" compiles to count(*); Total and Average to sum(col) / avg(col); a Percentage to count(*) FILTER (WHERE …) over count(*), so it is stored as two expressions rather than one.',

  measureField:
    'The column inside sum() or avg(). Only number fields appear — the registry records each column\'s kind, and the compiler refuses anything else rather than casting it.',

  filters:
    'The WHERE clause. Every row is joined with AND — the compiler cannot express OR, so two conditions on the same field mean "both", not "either". Values are compared against the stored id, never the label.',

  numerator:
    'The FILTER (WHERE …) inside the numerator only. The WHERE above still applies to both halves of the fraction, so repeating it here does not narrow the top — it just makes the percentage read 100%.',

  timeField:
    'The column the rollup buckets by — the date_trunc() argument. A record lands in exactly one period, decided by this column, so the same records counted by "Raised" and by "Closed" produce two genuinely different series.',

  breakdown:
    'The GROUP BY columns, stored as the metric\'s dimensions. Date columns are refused: grouping by a raw timestamp yields one row per record, which is why periods are handled by the grain instead.',

  direction:
    'Presentation only — it never changes the figure. It tells a dashboard whether a rise should be coloured as good or bad.',

  grain:
    'The bucket width the rollup computes at — date_trunc(\'month\', …) and so on. Stored per metric because it is the resolution the figures are kept at, not a display choice that can be changed later without recomputing.',
}

/**
 * Every reportable field a custom module declares, with its answer options.
 *
 * ── WHY THIS EXISTS ALONGSIDE reportingKeyOptions ──────────────────────────
 * That one answers "which key is this metric measuring" — a single picker, one
 * choice, used with sum/avg. This one carries the whole field: its type, and
 * for a dropdown the exact set of answers it can hold. The filter row needs
 * both halves, and merging them would give the measure picker a payload it has
 * no use for.
 *
 * ── WHY THE OPTIONS COME FROM THE FORM, NOT THE DATA ───────────────────────
 * A custom module's answers live in analytics_field_values.text_value — free
 * text as far as Postgres is concerned, with no lookup table to join. The set
 * of legal answers exists only in `form_templates.schema`, as the `options`
 * array the author typed into the form builder.
 *
 * Reading the distinct values out of the data instead would be wrong in both
 * directions: an option nobody has chosen yet would be missing, and a value
 * left behind by a since-renamed option would appear as though it were current.
 * The form is the definition; the data is a sample of it.
 *
 * @param {object[]} templates FormTemplate rows (isModule, internalName, schema)
 * @param {string} moduleId the custom module key, e.g. 'lead_crm'
 * @returns {{key: string, label: string, type: string, options: string[]}[]}
 */
export function reportingFields(templates, moduleId) {
  if (!moduleId) return []
  const template = (Array.isArray(templates) ? templates : []).find(
    (t) => t?.isModule && t?.internalName === moduleId,
  )
  if (!template) return []

  const out = []
  const seen = new Set()
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node.children)) {
      node.children.forEach(visit)
      return
    }
    const key = node.reporting?.enabled && node.reporting?.key?.trim()
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push({
      key,
      label: node.label || key,
      type: node.type || 'input',
      // Only a dropdown-shaped field constrains its answers. Everything else
      // (text, number, date) is open, and offering a picker built from nothing
      // would be a dropdown with no way past.
      options: Array.isArray(node.options) ? node.options.filter(Boolean).map(String) : [],
    })
  }
  ;(Array.isArray(template.schema) ? template.schema : []).forEach(visit)
  return out.sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * ── RETIRED, AND KEPT AS A NO-OP ON PURPOSE ────────────────────────────────
 *
 * This warned that filtering two custom fields at once would count nothing,
 * which was true: the compiler ANDed both predicates into one WHERE over one
 * row, and a row is one (record, field), so it asked that row to be two fields
 * at once. "Open web leads" returned 0 against a true 10.
 *
 * The compiler now emits one EXISTS per field, correlated on record_id
 * (migration 20260923120000), so the question it warned about is the question
 * the builder is FOR. Leaving the warning would tell people not to do the
 * thing that now works.
 *
 * Kept as a function returning null rather than deleted: a stored definition
 * written before today is unaffected either way, and callers that still import
 * it keep working while they are cleaned up. It has no other behaviour.
 *
 * @returns {null} always
 */
export function eavFilterConflict() {
  return null
}

// ── custom-module fields, shown the way a built-in module's are ─────────────

/**
 * Marks a filter row that names a FORM FIELD rather than a registry column.
 *
 * A stored definition never contains this prefix: it is expanded on the way
 * into the definition and recognised on the way back out. Chosen to be
 * impossible to confuse with a real column, which must match ^[a-z_][a-z0-9_]*$
 * — a colon cannot appear in one, so `custom:` can never collide.
 */
export const CUSTOM_FIELD_PREFIX = 'custom:'

/**
 * ── WHY CUSTOM MODULES GET A TRANSLATION LAYER AND BUILT-IN ONES DO NOT ─────
 *
 * On a built-in module the source table IS the module, so every field is a
 * column and a filter is one predicate:
 *
 *     documents.status_id = 'ACTIVE'
 *
 * A custom module has no table. Its answers live in analytics_field_values, one
 * ROW per (record, field), so "Lead Status is OPEN" is not one predicate but
 * two, on the same row:
 *
 *     reporting_key = 'lead_status' AND text_value = 'OPEN'
 *
 * Exposing that pair in the builder made the author supply it themselves: one
 * filter row picking the field out of `Field`, a second picking the answer out
 * of `Answer`, the second silently depending on the first. That is the storage
 * shape leaking into the question — nobody asks "which field, and what answer",
 * they ask "which leads are OPEN". The pair also has a failure the author
 * cannot see coming: two rows naming DIFFERENT fields compile, publish, and
 * count nothing, because one row cannot be two fields at once.
 *
 * So the builder offers the FORM's own fields — "Lead Source", "Lead Status",
 * each with the options the author typed into the form builder — and expands
 * the choice into the pair on save. The definition written to the database is
 * unchanged, byte for byte, from what the two-row form produced: the compiler,
 * the registry and the security model see exactly what they saw before.
 *
 * Two DIFFERENT custom fields filtered at once used to be unaskable — the
 * compiler ANDed both predicates into one WHERE over one row, so "open web
 * leads" returned 0 against a true 10. The compiler now emits one EXISTS per
 * field, correlated on record_id (migration 20260923120000), so the pair works
 * and `eavFilterConflict` has been retired to a no-op.
 */

/** Is this a virtual form-field row rather than a registry column? */
export function isCustomFieldRef(field) {
  return typeof field === 'string' && field.startsWith(CUSTOM_FIELD_PREFIX)
}

/** The reporting key inside a virtual reference, or null. */
export function customFieldKey(field) {
  return isCustomFieldRef(field) ? field.slice(CUSTOM_FIELD_PREFIX.length) : null
}

/**
 * Build the virtual reference for one reporting key.
 *
 * @param {string} key
 */
export function customFieldRef(key) {
  return `${CUSTOM_FIELD_PREFIX}${key}`
}

/**
 * The filter-field options a CUSTOM module should show.
 *
 * Replaces `Field` and `Answer` — the two halves of the storage shape — with
 * the form's own fields. The remaining registry columns (Occurred, Site,
 * Department, Owner) are genuine per-record facts and stay exactly as they are,
 * which is why this returns them untouched rather than rebuilding the list.
 *
 * `Value` is dropped for the same reason `Answer` is: a numeric answer is
 * reached through its field like any other, and leaving the raw column in the
 * list offers a second, worse route to the same question.
 *
 * @param {{value: string, label: string}[]} registryOptions from analytics_module_fields
 * @param {{key: string, label: string, type: string, options: string[]}[]} formFields
 */
export function customFilterFields(registryOptions, formFields) {
  const HIDDEN = new Set(['reporting_key', 'text_value', 'numeric_value'])
  const own = (formFields ?? []).map((f) => ({
    value: customFieldRef(f.key),
    label: f.label,
  }))
  const rest = (registryOptions ?? []).filter((o) => !HIDDEN.has(o.value))
  return [...own, ...rest]
}

/**
 * Expand every virtual row into the (reporting_key, text_value) pair the
 * compiler expects, leaving real columns alone.
 *
 * Runs on save. A row with no values expands to the key pin alone, which is
 * both what the author asked for ("any answer to this field") and what the
 * sum/avg guard requires, so the two agree without special-casing.
 *
 * @param {object[]} filters
 * @returns {object[]} filters in stored form
 */
export function expandCustomFilters(filters) {
  const out = []
  for (const f of filters ?? []) {
    const key = customFieldKey(f?.field)
    if (!key) {
      out.push(f)
      continue
    }
    out.push({ field: 'reporting_key', op: 'in', values: [key] })
    if (!VALUELESS_OPS.includes(f.op) && (f.values ?? []).length) {
      out.push({ field: 'text_value', op: f.op ?? 'in', values: [...f.values] })
    } else if (VALUELESS_OPS.includes(f.op)) {
      out.push({ field: 'text_value', op: f.op, values: [] })
    }
  }
  return out
}

/**
 * The inverse: fold a stored pair back into one virtual row for editing.
 *
 * ⚠ ONLY folds a pair it is certain about — a `reporting_key` row naming
 * exactly ONE key, immediately followed by a `text_value` row. Anything else
 * (two keys, a lone `text_value`, the pair interleaved with other filters) is
 * left in its stored form and shown as the raw rows it is.
 *
 * That conservatism is deliberate. A definition written before this existed, or
 * through the API, or by a future path, is not required to match this shape,
 * and guessing at one would silently rewrite a filter the author did not touch.
 * Showing it unfolded is honest: it still compiles, it still counts, and it
 * still says what it does.
 *
 * @param {object[]} filters stored filters
 * @returns {object[]} filters in editing form
 */
export function foldCustomFilters(filters) {
  const list = filters ?? []
  const out = []
  for (let i = 0; i < list.length; i += 1) {
    const f = list[i]
    const isKeyPin =
      f?.field === 'reporting_key' && (f.op ?? 'in') === 'in' && (f.values ?? []).length === 1
    if (!isKeyPin) {
      out.push(f)
      continue
    }
    const next = list[i + 1]
    if (next?.field === 'text_value') {
      out.push({
        field: customFieldRef(f.values[0]),
        op: next.op ?? 'in',
        values: [...(next.values ?? [])],
      })
      i += 1
      continue
    }
    // A bare pin with no answer row: the author filtered to a field without
    // narrowing the answer, which is a legal question ("leads that recorded a
    // source"). Folds to a virtual row with no values rather than staying raw.
    out.push({ field: customFieldRef(f.values[0]), op: 'in', values: [] })
  }
  return out
}

/**
 * The breakdown options a CUSTOM module should show.
 *
 * ── WHY `Answer` ALONE IS A TRAP ───────────────────────────────────────────
 * Grouping by `text_value` with no field pinned groups the answers of EVERY
 * field together. On a lead form that renders one chart containing PROGRESS,
 * WEB, OPEN, EMAIL and SMS side by side — statuses and sources mixed, as
 * though they were values of one thing. It does not error and the bars are
 * real; the chart is simply meaningless. Measured on lead_crm: 7 "segments"
 * drawn from 3 unrelated fields.
 *
 * So `Answer` is replaced by the form's own fields. "Break down by Lead Source"
 * expands to `groupBy: ['text_value']` plus a `reporting_key = 'lead_source'`
 * filter, which is the pair that yields one series per source.
 *
 * `Field` stays, under its own label: "one series per reportable field" is a
 * real question (it is how you chart several numeric answers at once, and the
 * sum/avg guard accepts it), and it is not expressible any other way.
 *
 * @param {{value: string, label: string}[]} registryOptions
 * @param {{key: string, label: string}[]} formFields
 */
export function customGroupFields(registryOptions, formFields) {
  const own = (formFields ?? []).map((f) => ({
    value: customFieldRef(f.key),
    label: f.label,
  }))
  const rest = (registryOptions ?? []).filter((o) => o.value !== 'text_value')
  return [...own, ...rest]
}

/**
 * Expand a breakdown list, returning the groupBy AND the filter the pin needs.
 *
 * ⚠ Only ONE custom field can be broken down at a time, for the same reason
 * only one can be filtered: each answer is its own row, so two pins ask one row
 * to be two fields. The caller is expected to surface that; this keeps the
 * FIRST and drops later ones rather than emitting a pair that counts nothing.
 *
 * @param {string[]} groupBy possibly containing virtual refs
 * @returns {{groupBy: string[], pins: object[]}}
 */
export function expandCustomGroupBy(groupBy) {
  const out = []
  const pins = []
  let taken = null
  for (const g of groupBy ?? []) {
    const key = customFieldKey(g)
    if (!key) {
      out.push(g)
      continue
    }
    if (taken && taken !== key) continue
    taken = key
    if (!out.includes('text_value')) out.push('text_value')
    if (!pins.length) pins.push({ field: 'reporting_key', op: 'in', values: [key] })
  }
  return { groupBy: out, pins }
}

/**
 * Fold a stored breakdown back for editing: `text_value` grouped alongside a
 * single-key pin becomes that field's virtual reference.
 *
 * Conservative in the same way foldCustomFilters is — with no pin, or several,
 * the stored `text_value` is left as it is, because it means what it says.
 *
 * @param {string[]} groupBy
 * @param {object[]} filters the STORED filters, read for the pin
 */
export function foldCustomGroupBy(groupBy, filters) {
  const list = groupBy ?? []
  if (!list.includes('text_value')) return list
  const keys = new Set()
  for (const f of filters ?? []) {
    if (f?.field !== 'reporting_key' || (f.op ?? 'in') !== 'in') continue
    for (const v of f.values ?? []) keys.add(String(v))
  }
  if (keys.size !== 1) return list
  const [key] = [...keys]
  return list.map((g) => (g === 'text_value' ? customFieldRef(key) : g))
}
