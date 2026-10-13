/**
 * The live preview's two pure helpers: a CATALOG ROW for a metric that does not
 * exist yet, and the frozen request payload the preview tile carries.
 * Plan: qms/docs/plans/custom-metric-live-preview.md (§3.2 contract, §4 frontend).
 *
 * ── WHY A FAKE CATALOG ROW AND NOT A SECOND SET OF PICKERS ──────────────────
 * The widget settings (visualisation, "show separately by", period, compare,
 * rank by, top N) are AnalyticsQuestionBuilder, and every rule it enforces —
 * `vizOptionsFor`, `dimensionOptionsFor`, `clampQuestion` — reads a
 * metric_catalog row. Handing it a row shaped exactly like one means the preview
 * offers precisely the choices the saved metric will offer on a dashboard, with
 * no second copy of those rules to drift.
 *
 * ── ⚠ THE ROW MUST SAY WHAT THE COMPILER WILL SAY ───────────────────────────
 * `unit` gates the visualisations (stacked bar / donut are count-only) and the
 * dimension `key` is the string the preview request sends back as
 * `params.dimension`. Both are derived below exactly as
 * analytics_compile_custom_metric derives them (backend/api/migrations/sql/
 * 20260918030050-functions.sql, the measure and group-by blocks). If this file
 * and the compiler disagree, the builder offers a chart the saved metric will
 * not, or the server answers "is not a declared dimension" — so when the
 * compiler changes, change this with it.
 */

/** The metricKey every preview row and question carries. Not a real metric. */
export const PREVIEW_METRIC_KEY = 'preview'

/**
 * Unit per measure type, verbatim from the compiler's measure block:
 *
 *   count     -> 'count'
 *   sum       -> 'count'    ⚠ NOT the field's unit: the compiler leaves v_unit at
 *                           its 'count' default for sum — there is no per-field
 *                           unit in analytics_module_fields to take one from
 *   avg       -> 'days'     the only unit analytics_compose_value renders as a
 *                           plain num/den mean (see the note in the compiler)
 *   duration  -> 'days'
 *   ratio     -> 'percent'
 *
 * countDistinct / aging / median / min / max are REFUSED by the compiler, so
 * they never reach a tile; they fall back to 'count' here and the preview
 * request comes back with the refusal as `compileError`.
 */
const UNIT_BY_MEASURE = {
  count: 'count',
  sum: 'count',
  avg: 'days',
  duration: 'days',
  ratio: 'percent',
}

/** Precision the compiler stores beside the unit (format.precision). */
const PRECISION_BY_UNIT = { count: 0, days: 1, percent: 1 }

/** @param {object|null} definition the STORED definition */
export function unitForDefinition(definition) {
  const type = definition?.measure?.type || 'count'
  return UNIT_BY_MEASURE[type] ?? 'count'
}

/**
 * Postgres `initcap(replace(x, '_', ' '))`: first letter of each alphanumeric
 * run upper-cased, the rest lower-cased. Only used for the LABEL; the key is
 * lower-cased afterwards so casing can never change it.
 */
function pgInitcap(text) {
  return String(text)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|[^a-z0-9])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase())
}

/**
 * The compiler's dimension key: `lower(regexp_replace(label, '[^a-zA-Z0-9]+',
 * '_', 'g'))`. Note it is built from the LABEL, not the column name — a
 * `status_id` column labelled "Status" is the key `status`.
 */
function dimensionKey(label) {
  return String(label)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase()
}

/**
 * The compiler names an EAV `text_value` split after the single reporting_key
 * the filters pin it to ("Lead Source", not "Answer"). Several pins, or none,
 * keep the generic registry label — same rule, same reason.
 */
function pinnedReportingKey(definition) {
  const pinned = []
  for (const f of definition?.filters || []) {
    if (f?.field !== 'reporting_key') continue
    if ((f.op || 'in') !== 'in') continue
    for (const v of f.values || []) pinned.push(String(v))
  }
  return pinned.length === 1 ? pinned[0] : null
}

/**
 * The declared dimensions, shaped like metric_catalog's `dimensions` jsonb
 * (`{ key, expr, filterKey }`) plus a `label`. A groupBy column the registry
 * does not list is skipped — the compiler refuses it, and the preview request
 * returns that refusal as its compileError.
 */
function draftDimensions(definition, fields) {
  const source = definition?.sourceTable ?? null
  const pinned = pinnedReportingKey(definition)
  const out = []
  for (const column of definition?.groupBy || []) {
    const field = (fields || []).find(
      (f) =>
        f?.columnName === column &&
        (!source || !f.sourceTable || f.sourceTable === source) &&
        f.groupable !== false,
    )
    if (!field) continue
    let label = field.label || column
    if (source === 'analytics_field_values' && field.columnName === 'text_value' && pinned) {
      label = pgInitcap(pinned)
    }
    out.push({
      key: dimensionKey(label),
      expr: field.columnName,
      filterKey: field.filterKey ?? null,
      label,
    })
  }
  return out
}

/**
 * A metric_catalog-shaped row for a draft metric, for AnalyticsQuestionBuilder
 * (`:metrics="[row]" lockMetric`) and AnalyticsQuestionTile (`:metric="row"`).
 *
 * Carries no tier, scope, drill or calculation note: the metric does not exist,
 * so none of them is true yet. The tile states "Preview — computed live …" in
 * their place.
 *
 * @param {object} p
 * @param {string} [p.name]
 * @param {string} p.moduleId
 * @param {string} [p.direction]  'higher_is_better' | 'lower_is_better' | 'neutral'
 * @param {string} [p.grain]      the metric's grain ('month' default)
 * @param {object} p.definition   the STORED definition (custom virtual rows expanded)
 * @param {Array}  [p.fields]     AnalyticsModuleField rows of the source table
 */
export function draftCatalogRow({ name, moduleId, direction, grain, definition, fields } = {}) {
  const unit = unitForDefinition(definition)
  return {
    metricKey: PREVIEW_METRIC_KEY,
    name: name?.trim() || 'Untitled metric',
    description: null,
    calculationNote: null,
    moduleId: moduleId ?? null,
    unit,
    precision: PRECISION_BY_UNIT[unit] ?? 0,
    direction: direction || 'neutral',
    tier: null,
    defaultGrain: grain || 'month',
    dimensions: draftDimensions(definition, fields),
    dimensionCapacity: null,
    drill: null,
    effectiveScope: null,
    isPreview: true,
  }
}

/**
 * The `previewDefinition` prop for AnalyticsQuestionTile / AnalyticsKpiCard:
 * the metric half of the preview request body (the tile adds `kind` and
 * `params` per read). Null until every required part is present — a null here
 * means "send nothing", which is what the tile does with it.
 *
 * Frozen so a caller cannot mutate it in place under a tile that has already
 * serialised it into a request key.
 *
 * @returns {Readonly<{moduleId:string, grain:string, direction:string, definition:object}>|null}
 */
export function previewPayload({ moduleId, grain, direction, definition } = {}) {
  if (!moduleId || !definition || typeof definition !== 'object') return null
  if (!definition.sourceTable || !definition.timeField) return null
  return Object.freeze({
    moduleId,
    grain: grain || 'month',
    direction: direction || 'neutral',
    // A deep copy through JSON: the definition is reactive form state, and the
    // request must describe the draft as it was when this payload was built.
    definition: JSON.parse(JSON.stringify(definition)),
  })
}
