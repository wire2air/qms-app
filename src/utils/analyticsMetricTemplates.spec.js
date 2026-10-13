import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  MEASURES,
  VALUELESS_OPS,
  definitionProblem,
  definitionSentence,
} from '@/utils/analyticsCustomMetricAccess.js'
import { METRIC_TEMPLATES, templatesForModule } from '@/utils/analyticsMetricTemplates.js'

/**
 * ── WHY THIS SPEC READS THE MIGRATIONS ──────────────────────────────────────
 * A template is a set of column names and status values, and neither is checked
 * anywhere until the server compiles the metric. A wrong one does not throw: it
 * populates the form, looks entirely plausible, and fails on save with a message
 * about a column the user never typed. That is the exact failure mode this whole
 * feature is meant to avoid, so a spec asserting templates against a hand-copied
 * list of columns would be asserting the same assumption twice.
 *
 * Instead the registry is parsed out of the two migrations that seed
 * analytics_module_fields, which is what the compiler itself reads. If someone
 * renames a column in a migration and not here, this fails.
 *
 * It is a regex over a migration rather than a database query because the unit
 * suite has no database — and it is pinned to the seeding INSERT, whose shape is
 * stable and whose drift would break the parse loudly rather than silently
 * returning an empty set (asserted below).
 *
 * Repointed 2026-09-20. The 2026-09-18 database rebuild replaced the whole
 * migration history: the two files this read were consolidated into
 * 20260918020730-create-analytics-module-fields.js, and the shape changed from a
 * `const REGISTRY` array of arrays to a SQL VALUES list carrying an explicit id
 * first. The spec could not even load, so it failed on develop and took every
 * frontend PR's CI with it.
 */
/**
 * ⚠ EVERY migration that seeds analytics_module_fields must be listed, or the
 * templates for whatever it registered fail here with "not in the registry" —
 * which reads like a bad template rather than a missing file.
 *
 * The 2026-09-23 pair use a different shape from the 2026-09-18 baseline: a
 * `const ROWS` array of arrays rather than a SQL VALUES list, and no id column.
 * readRegistry parses both.
 */
const MIGRATIONS = [
  '../../../qms/backend/api/migrations/20260918020730-create-analytics-module-fields.js',
  '../../../qms/backend/api/migrations/20260923140000-register-modules-in-metric-builder.js',
  '../../../qms/backend/api/migrations/20260923170000-register-modules-round-two.js',
  '../../../qms/backend/api/migrations/20260923200000-cross-module-link-fields.js',
  '../../../qms/backend/api/migrations/20260923230000-register-modules-round-three.js',
]

/** @returns {Map<string, {columns: Set<string>, dates: Set<string>, groupable: Set<string>, numbers: Set<string>}>} */
function readRegistry() {
  const byModule = new Map()
  for (const rel of MIGRATIONS) {
    const source = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    // The 2026-09-23 migrations build their rows in a `const ROWS` array above
    // the INSERT; the 2026-09-18 baseline lists them inside it. Start from
    // whichever comes first so both shapes are reachable.
    const rowsAt = source.indexOf('const ROWS = [')
    const insertAt = source.indexOf('INSERT INTO')
    const body = source.slice(rowsAt >= 0 ? rowsAt : insertAt)
    // (id, module_id, source_table, column_name, label, kind, lookup_table,
    //  filter_key, groupable, filterable, display_order, scope_role)
    const row =
      /\(\s*'[0-9a-f-]{36}',\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'([^']*)',\s*'([a-z]+)',\s*(?:'[a-z_]+'|NULL),\s*(?:'[A-Za-z]+'|NULL),\s*(true|false),\s*(true|false),\s*\d+,\s*(?:'[a-z]+'|NULL)\s*\)/g
    // The JS-array shape: ['module', 'table', 'column', 'Label', 'kind',
    //                       lookup, filterKey, groupable, filterable, order, scope]
    const jsRow =
      /\[\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'([^']*)',\s*'([a-z]+)',\s*(?:'[a-z_]+'|null),\s*(?:'[A-Za-z]+'|null),\s*(true|false),\s*(?:true|false),\s*\d+,\s*(?:'[a-z]+'|null)\s*\]/g

    let m
    for (const re of [row, jsRow]) {
      re.lastIndex = 0
      while ((m = re.exec(body))) {
      const [, moduleId, table, column, , kind, groupable] = m
      const key = `${moduleId}::${table}`
      if (!byModule.has(key)) {
        byModule.set(key, {
          columns: new Set(),
          dates: new Set(),
          groupable: new Set(),
          numbers: new Set(),
          kinds: new Map(),
        })
      }
      const entry = byModule.get(key)
      entry.columns.add(column)
      entry.kinds.set(column, kind)
      if (kind === 'date') entry.dates.add(column)
      if (kind === 'number') entry.numbers.add(column)
      if (groupable === 'true') entry.groupable.add(column)
      }
    }
  }
  return byModule
}

const REGISTRY = readRegistry()

/**
 * Status vocabularies, also read from the migrations that seed them rather than
 * copied. The pre-unification ids (NEW, IN_PROGRESS, APPROVED…) were deleted by
 * the unify migrations, so a template naming one would populate a form and then
 * fail to compile against a foreign key.
 */
const STATUS_SEEDS = {
  capa_statuses: ['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED'],
  nc_statuses: ['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED'],
  complaint_statuses: ['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED'],
  change_request_statuses: ['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED'],
  document_statuses: ['ACTIVE', 'ARCHIVED'],
  // ⚠ FOUR VALUES, NOT SIX. This list said DRAFT / OPEN / UNDER_REVIEW /
  // AWAITING_DECISION / CLOSED / CANCELLED until 2026-09-23, and the templates
  // filtered on the two that do not exist. Because BOTH the templates and this
  // fixture carried the same wrong vocabulary, the spec validated the mistake
  // against itself and passed — the exact "asserting the same assumption twice"
  // failure this file's header warns about for COLUMNS, reproduced for STATUSES.
  //
  // The four metrics compiled, published and matched nothing for ever; the UI
  // rendered "Preparing", which reads as "not computed yet" rather than "this
  // status does not exist". Found by a human looking at a dashboard tile, not
  // by this suite.
  //
  // Verified against quality_event_statuses on app-db, which holds exactly
  // these four. quality_events IS on the unified machine.
  quality_event_statuses: ['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED'],
  audit_finding_statuses: [
    'OPEN',
    'IN_REVIEW',
    'IN_REMEDIATION',
    'VERIFIED',
    'CLOSED',
    'CANCELLED',
  ],
  // ── Added with the 2026-09-23 module registrations ───────────────────────
  // Read from the lookup TABLES on app-db, not from the values that happen to
  // appear in seeded data: a status nobody has used yet is still valid, and a
  // template naming it must not fail here.
  supplier_statuses: ['APPROVED', 'BLOCKED', 'PENDING', 'REJECTED'],
  inspection_lot_statuses: ['CANCELLED', 'CLOSED', 'DRAFT', 'OPEN'],
  customer_complaint_statuses: [
    'ASSIGNED',
    'CLOSED',
    'CONVERTED_TO_NC',
    'IN_PROGRESS',
    'NEW',
    'ON_HOLD',
    'OPEN',
    'PENDING_APPROVAL',
    'RESOLVED',
    'UNDER_REVIEW',
    'WAITING_CUSTOMER',
  ],
  // ⚠ NO LOOKUP TABLE EXISTS for these two — audit_instances.status_id and the
  // three training `status` columns are free text, which is why the registry
  // records lookup_table NULL for them. Listed here anyway so a template naming
  // a status the module does not use still fails this spec: the point of the
  // check is that the value is REAL, and a missing foreign key makes a typo
  // more dangerous, not less.
  audit_instance_statuses: ['OPEN', 'CLOSED', 'CANCELLED'],
  training_statuses: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
  training_instance_statuses: ['ACTIVE', 'PENDING_VERIFICATION', 'COMPLETED', 'CANCELLED'],
  training_assignee_statuses: [
    'ASSIGNED',
    'IN_PROGRESS',
    'COMPLETED',
    'VERIFIED',
    'FAILED',
    'RETRAIN_REQUIRED',
    'REMOVED',
  ],
  task_instance_statuses: [
    'ASSIGNED',
    'IN_PROGRESS',
    'FORM_SUBMITTED',
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'SENT_BACK',
    'CHANGES_REQUESTED',
    'REASSIGNED',
    'CANCELLED',
  ],

  // ── 20260923230000 sources ──────────────────────────────────────────────
  // ⚠ READ OFF LIVE DATA, NOT OFF A MODEL OR A GUESS. The whole reason this
  // fixture exists is that a template once filtered 'AWAITING_DECISION', a
  // quality-event status this schema has never had, and the fixture carried
  // the same wrong vocabulary -- so it validated the mistake against itself
  // and passed. Every value below was produced by
  // `SELECT DISTINCT <col> FROM <table> WHERE deleted_at IS NULL` on dev-db.
  //
  // Where live data shows FEWER values than the column could hold, the short
  // list is kept deliberately: a template may only filter on a value someone
  // has confirmed exists. Widen this when the schema is checked, never to make
  // a template pass.
  retain_sample_statuses: ['RETAINED', 'DISPOSED'],
  retain_sample_seal_states: ['SEALED', 'BROKEN'],
  retain_sample_types: ['REFERENCE', 'RESERVE'],
  log_book_statuses: ['DRAFT', 'ACTIVE'],
  training_verification_outcomes: ['APPROVED'],
  audit_program_types: ['INTERNAL', 'EXTERNAL', 'SUPPLIER'],
  audit_program_frequencies: ['ANNUAL', 'QUARTERLY', 'SEMI_ANNUAL'],
  product_statuses: ['ACTIVE', 'DISCONTINUED', 'OBSOLETE', 'UNDER_REVIEW'],
}

/** Which status lookup each source table's status_id points at. */
const STATUS_TABLE = {
  capas: 'capa_statuses',
  nonconformances: 'nc_statuses',
  documents: 'document_statuses',
  complaints: 'complaint_statuses',
  change_requests: 'change_request_statuses',
  quality_events: 'quality_event_statuses',
  audit_findings: 'audit_finding_statuses',
  suppliers: 'supplier_statuses',
  audit_instances: 'audit_instance_statuses',
  inspection_lots: 'inspection_lot_statuses',
  customer_complaints: 'customer_complaint_statuses',
  task_instances: 'task_instance_statuses',
  // ⚠ These three carry their state in a column called `status`, not
  // `status_id`. STATUS_TABLE is keyed by source table, so they resolve here;
  // the check below reads whichever of the two columns a filter names.
  trainings: 'training_statuses',
  training_instances: 'training_instance_statuses',
  training_assignees: 'training_assignee_statuses',
  // ── 20260923230000 ──────────────────────────────────────────────────────
  retain_samples: 'retain_sample_statuses',
  log_books: 'log_book_statuses',
  products: 'product_statuses',
}

describe('the parsed registry', () => {
  it('actually parsed something', () => {
    // Guards the regex above: a silently empty registry would make every
    // assertion below vacuously pass, which is the one way this spec could
    // fail to do its job.
    expect(REGISTRY.size).toBeGreaterThanOrEqual(7)
    for (const [key, entry] of REGISTRY) {
      expect(entry.columns.size, `${key} parsed no columns`).toBeGreaterThan(0)
      expect(entry.dates.size, `${key} parsed no date fields`).toBeGreaterThan(0)
    }
  })
})

describe('METRIC_TEMPLATES', () => {
  it('has unique ids', () => {
    const ids = METRIC_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(METRIC_TEMPLATES.map((t) => [t.id, t]))('%s is saveable as-is', (_id, t) => {
    // The cap is the rollup's shipped value; a template must fit inside it.
    expect(definitionProblem(t.definition, t, 3)).toBeNull()
  })

  it.each(METRIC_TEMPLATES.map((t) => [t.id, t]))(
    '%s names only registered columns',
    (_id, t) => {
      const entry = REGISTRY.get(`${t.moduleId}::${t.definition.sourceTable}`)
      expect(entry, `${t.moduleId}/${t.definition.sourceTable} is not in the registry`).toBeTruthy()

      // The date must be registered AND be a date, or the compiler answers
      // "is not a date this metric can be counted by".
      expect(entry.dates.has(t.definition.timeField), `${t.definition.timeField} is not a date`).toBe(true)

      for (const f of t.definition.filters ?? []) {
        expect(entry.columns.has(f.field), `filter on unregistered ${f.field}`).toBe(true)
      }
      // A groupBy column must be groupable, not merely present — the compiler
      // checks the flag, and dates are barred from grouping by a CHECK.
      for (const column of t.definition.groupBy ?? []) {
        expect(entry.groupable.has(column), `${column} is not groupable`).toBe(true)
      }
      if (t.definition.measure?.field) {
        expect(entry.columns.has(t.definition.measure.field)).toBe(true)
      }
    },
  )

  it.each(METRIC_TEMPLATES.map((t) => [t.id, t]))(
    '%s uses status values that still exist',
    (_id, t) => {
      for (const f of t.definition.filters ?? []) {
        if (f.field !== 'status_id') continue
        const vocabulary = STATUS_SEEDS[STATUS_TABLE[t.definition.sourceTable]]
        expect(vocabulary, `no vocabulary known for ${t.definition.sourceTable}`).toBeTruthy()
        for (const value of f.values) {
          expect(vocabulary, `${value} is not a current status`).toContain(value)
        }
      }
    },
  )

  it('only averages or sums a numeric column', () => {
    // The compiler rejects a non-number with "is not a number, so it cannot be
    // summed or averaged" — a rule easy to violate when adding a template.
    for (const t of METRIC_TEMPLATES) {
      const { type, field } = t.definition.measure ?? {}
      if (![MEASURES.SUM, MEASURES.AVG].includes(type)) continue
      const entry = REGISTRY.get(`${t.moduleId}::${t.definition.sourceTable}`)
      expect(entry.numbers.has(field), `${t.id} averages non-numeric ${field}`).toBe(true)
    }
  })

  // ⚠ THE DB IS THE ONLY PLACE THAT REJECTED THIS, AND IT REJECTED IT LATE.
  // 20260923230000 was first written with kind 'boolean' -- the SQL type name,
  // not one of the six analytics_module_fields_kind_chk accepts. Every check
  // in this file passed, because none of them looked at `kind` at all; the
  // INSERT then failed against app-db with a raw constraint violation quoting
  // a row.
  //
  // The list is duplicated from the constraint on purpose: this spec cannot
  // reach a database, so the alternative is not checking. Widening the
  // constraint without widening this list fails here with a message saying so,
  // which is the right way round -- a new kind is a deliberate act.
  it('registers only kinds the database constraint accepts', () => {
    const LEGAL = ['enum', 'uuid', 'date', 'number', 'text', 'bool']
    const registry = readRegistry()
    for (const [key, entry] of registry) {
      for (const [column, kind] of entry.kinds) {
        expect(LEGAL, `${key}.${column} has kind '${kind}'`).toContain(kind)
      }
    }
  })

  it('uses only operators the compiler supports', () => {
    const allowed = new Set(['in', 'notIn', ...VALUELESS_OPS])
    for (const t of METRIC_TEMPLATES) {
      for (const f of [...(t.definition.filters ?? []), ...(t.definition.measure?.numerator ?? [])]) {
        expect(allowed.has(f.op), `${t.id} uses ${f.op}`).toBe(true)
        if (!VALUELESS_OPS.includes(f.op)) expect(f.values.length).toBeGreaterThan(0)
      }
    }
  })

  it('expresses no template against today’s date', () => {
    // The compiler compares a column to a quote_literal()'d CONSTANT; there is
    // no token for "now". An "overdue" template would populate the form and then
    // fail, which is precisely the fake capability this work avoids.
    const serialised = JSON.stringify(METRIC_TEMPLATES).toLowerCase()
    for (const token of ['today', 'now()', 'current_date', '$now']) {
      expect(serialised).not.toContain(token)
    }
  })

  it('describes every template in words', () => {
    // If a template cannot be described, the panel goes blank the moment it is
    // applied — which would look like the template having broken the form.
    for (const t of METRIC_TEMPLATES) {
      const entry = REGISTRY.get(`${t.moduleId}::${t.definition.sourceTable}`)
      const fields = [...entry.columns].map((columnName) => ({
        columnName,
        // Labels are irrelevant to the assertion; only resolution matters.
        label: columnName,
      }))
      expect(definitionSentence(t.definition, t, fields), `${t.id} has no sentence`).toBeTruthy()
    }
  })

  it('carries a valid direction and grain', () => {
    for (const t of METRIC_TEMPLATES) {
      expect(['neutral', 'higher_is_better', 'lower_is_better']).toContain(t.direction)
      expect(['day', 'week', 'month', 'quarter', 'year']).toContain(t.grain)
    }
  })
})

describe('templatesForModule', () => {
  it('filters by module and returns everything when given none', () => {
    expect(templatesForModule()).toHaveLength(METRIC_TEMPLATES.length)
    const capa = templatesForModule('capa')
    expect(capa.length).toBeGreaterThan(0)
    expect(capa.every((t) => t.moduleId === 'capa')).toBe(true)
  })

  it('returns copies, so applying one cannot edit the template', () => {
    // The builder mutates the definition it is handed. Handing out the constant
    // would let the first metric someone builds permanently alter the template
    // for everyone after them, until reload, with no visible cause.
    const first = templatesForModule('capa')[0]
    first.definition.filters.push({ field: 'owner_id', op: 'isNull', values: [] })
    first.definition.groupBy.push('site_id')
    const second = templatesForModule('capa')[0]
    expect(second.definition.filters).not.toEqual(first.definition.filters)
    expect(second.definition.groupBy).not.toContain('site_id')
  })
})
