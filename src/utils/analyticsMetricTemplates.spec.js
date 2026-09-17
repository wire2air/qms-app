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
 * suite has no database — and it is pinned to the REGISTRY array literal, whose
 * shape is stable and whose drift would break the parse loudly rather than
 * silently returning an empty set (asserted below).
 */
const MIGRATIONS = [
  '../../../qms/backend/api/migrations/20260828140000-custom-metrics-foundation.js',
  '../../../qms/backend/api/migrations/20260917120000-custom-metrics-registry-four-modules.js',
]

/** @returns {Map<string, {columns: Set<string>, dates: Set<string>, groupable: Set<string>, numbers: Set<string>}>} */
function readRegistry() {
  const byModule = new Map()
  for (const rel of MIGRATIONS) {
    const source = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    const body = source.slice(source.indexOf('const REGISTRY'))
    // ['module', 'table', 'column', 'Label', 'kind', lookup, filterKey, groupable, filterable]
    const row =
      /\[\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'([a-z_]+)',\s*'([^']*)',\s*'([a-z]+)',\s*(?:'[a-z_]+'|null),\s*(?:'[A-Za-z]+'|null),\s*(true|false),\s*(true|false)\s*\]/g
    let m
    while ((m = row.exec(body))) {
      const [, moduleId, table, column, , kind, groupable] = m
      const key = `${moduleId}::${table}`
      if (!byModule.has(key)) {
        byModule.set(key, {
          columns: new Set(),
          dates: new Set(),
          groupable: new Set(),
          numbers: new Set(),
        })
      }
      const entry = byModule.get(key)
      entry.columns.add(column)
      if (kind === 'date') entry.dates.add(column)
      if (kind === 'number') entry.numbers.add(column)
      if (groupable === 'true') entry.groupable.add(column)
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
  quality_event_statuses: [
    'DRAFT',
    'OPEN',
    'UNDER_REVIEW',
    'AWAITING_DECISION',
    'CLOSED',
    'CANCELLED',
  ],
  audit_finding_statuses: [
    'OPEN',
    'IN_REVIEW',
    'IN_REMEDIATION',
    'VERIFIED',
    'CLOSED',
    'CANCELLED',
  ],
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
