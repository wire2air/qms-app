import { describe, it, expect } from 'vitest'
import {
  MEASURES,
  describeDefinition,
  lookupModelName,
  lookupRowLabel,
  moduleLabel,
  recordLabel,
} from './analyticsCustomMetricAccess.js'

/**
 * The summary sentence is the one thing in the builder a non-analyst reads to
 * check the metric is the one they were asked for, so its wording is pinned —
 * the same reason humaniseCode's is.
 */
const FIELDS = [
  { columnName: 'created_at', label: 'Raised' },
  { columnName: 'status_id', label: 'Status' },
  { columnName: 'site_id', label: 'Site' },
  { columnName: 'days_open', label: 'Days open' },
]

function labels(column, value) {
  return { CLOSED: 'Closed', CANCELLED: 'Cancelled' }[value] ?? ''
}

describe('describeDefinition', () => {
  it('says nothing until there is something to describe', () => {
    expect(describeDefinition({ sourceTable: 'capas' }, {}, FIELDS)).toBeNull()
    expect(describeDefinition({ timeField: 'created_at' }, {}, FIELDS)).toBeNull()
  })

  it('describes a plain count', () => {
    const text = describeDefinition(
      { sourceTable: 'capas', timeField: 'created_at', measure: { type: MEASURES.COUNT } },
      { grain: 'month' },
      FIELDS,
    )
    expect(text).toBe('How many CAPAs there are — reported monthly, counted by the raised date.')
  })

  it('names the filters, the breakdown and the direction', () => {
    const text = describeDefinition(
      {
        sourceTable: 'capas',
        timeField: 'created_at',
        measure: { type: MEASURES.COUNT },
        filters: [{ field: 'status_id', op: 'notIn', values: ['CLOSED', 'CANCELLED'] }],
        groupBy: ['site_id', 'status_id'],
      },
      { grain: 'week', direction: 'lower_is_better' },
      FIELDS,
      labels,
    )
    expect(text).toBe(
      'How many CAPAs there are, counting only those where Status is not Closed or Cancelled — ' +
        'reported weekly, counted by the raised date. It can be broken down by Site and Status. ' +
        'A falling figure is good.',
    )
  })

  it('describes a percentage by its numerator', () => {
    const text = describeDefinition(
      {
        sourceTable: 'capas',
        timeField: 'created_at',
        measure: {
          type: MEASURES.RATIO,
          numerator: [{ field: 'status_id', op: 'in', values: ['CLOSED'] }],
        },
      },
      {},
      FIELDS,
      labels,
    )
    expect(text).toBe(
      'The percentage of CAPAs where Status is Closed — reported monthly, counted by the raised date.',
    )
  })

  it('describes the numeric measures', () => {
    const base = { sourceTable: 'capas', timeField: 'created_at' }
    expect(
      describeDefinition({ ...base, measure: { type: MEASURES.AVG, field: 'days_open' } }, {}, FIELDS),
    ).toMatch(/^The average Days open across CAPAs/)
    expect(
      describeDefinition({ ...base, measure: { type: MEASURES.SUM, field: 'days_open' } }, {}, FIELDS),
    ).toMatch(/^Adds up Days open across CAPAs/)
    expect(
      describeDefinition(
        { ...base, measure: { type: MEASURES.COUNT_DISTINCT, field: 'site_id' } },
        {},
        FIELDS,
      ),
    ).toMatch(/^How many different Site values appear across CAPAs/)
  })

  it('falls back to humanising a code when no label resolves', () => {
    const text = describeDefinition(
      {
        sourceTable: 'nonconformances',
        timeField: 'created_at',
        filters: [{ field: 'status_id', op: 'in', values: ['IN_PROGRESS'] }],
      },
      {},
      FIELDS,
    )
    expect(text).toContain('Status is In progress')
  })

  it('reads a valueless comparison as set / not set', () => {
    const text = describeDefinition(
      {
        sourceTable: 'capas',
        timeField: 'created_at',
        filters: [{ field: 'site_id', op: 'isNull' }],
      },
      {},
      FIELDS,
    )
    expect(text).toContain('Site is not set')
  })
})

describe('labels', () => {
  it('overrides the slugs title case gets wrong', () => {
    expect(recordLabel('capas')).toBe('CAPAs')
    expect(moduleLabel('ncr')).toBe('Nonconformances')
  })

  it('still derives a label for anything not listed', () => {
    expect(moduleLabel('supplier_management')).toBe('Supplier Management')
    expect(recordLabel('audit_findings')).toBe('audit findings')
  })
})

describe('lookupModelName', () => {
  // A stand-in for `db` — only the registered store name matters.
  const db = {
    CapaStatus: { schema: { tableName: 'capaStatuses' } },
    Site: { schema: { tableName: 'sites' } },
    NcRootCauseCategory: { schema: { tableName: 'ncRootCauseCategories' } },
    notAModel: {},
    get Exploding() {
      return {
        get schema() {
          throw new Error('nope')
        },
      }
    },
  }

  it('maps a Postgres lookup table to the model that mirrors it', () => {
    expect(lookupModelName(db, 'capa_statuses')).toBe('CapaStatus')
    expect(lookupModelName(db, 'sites')).toBe('Site')
    expect(lookupModelName(db, 'nc_root_cause_categories')).toBe('NcRootCauseCategory')
  })

  it('returns null rather than throwing for an unmodelled or absent table', () => {
    expect(lookupModelName(db, 'widgets')).toBeNull()
    expect(lookupModelName(db, null)).toBeNull()
  })
})

describe('lookupRowLabel', () => {
  it('uses whatever the model calls its label', () => {
    expect(lookupRowLabel({ id: 'X', name: 'Closed' })).toBe('Closed')
    expect(lookupRowLabel({ id: 'X', title: 'SOP-1' })).toBe('SOP-1')
    expect(lookupRowLabel({ id: 'u1', firstName: 'Ada', lastName: 'Lovelace' })).toBe('Ada Lovelace')
    expect(lookupRowLabel({ id: 'IN_PROGRESS' })).toBe('In progress')
  })
})
