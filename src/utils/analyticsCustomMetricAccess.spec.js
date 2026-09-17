import { describe, it, expect } from 'vitest'
import {
  MEASURES,
  canManageCustomMetrics,
  humaniseCode,
  blankDefinition,
  definitionProblem,
  definitionSentence,
} from '@/utils/analyticsCustomMetricAccess.js'

/**
 * Registry rows for one module and source table, in the shape the SyncEngine
 * hands the builder. Only the three keys definitionSentence() reads are needed;
 * the extra ones are here so a future reader does not mistake this for the whole
 * row shape.
 */
const CAPA_FIELDS = [
  { columnName: 'status_id', label: 'Status', kind: 'enum', filterable: true, groupable: true },
  { columnName: 'priority_id', label: 'Priority', kind: 'enum', filterable: true, groupable: true },
  {
    columnName: 'department_id',
    label: 'Department',
    kind: 'uuid',
    filterable: true,
    groupable: true,
  },
  { columnName: 'owner_id', label: 'Owner', kind: 'uuid', filterable: true, groupable: true },
  { columnName: 'created_at', label: 'Raised', kind: 'date', filterable: true, groupable: false },
  { columnName: 'closed_at', label: 'Closed', kind: 'date', filterable: true, groupable: false },
  {
    columnName: 'risk_score',
    label: 'Risk score',
    kind: 'number',
    filterable: true,
    groupable: false,
  },
]

/** A minimal valid definition, so each test varies exactly one thing. */
function countDef(overrides = {}) {
  return {
    ...blankDefinition(),
    sourceTable: 'capas',
    timeField: 'created_at',
    measure: { type: MEASURES.COUNT },
    ...overrides,
  }
}

describe('canManageCustomMetrics', () => {
  it('requires the manage permission', () => {
    expect(canManageCustomMetrics({ canManage: true })).toBe(true)
    expect(canManageCustomMetrics({ canManage: false })).toBe(false)
    expect(canManageCustomMetrics()).toBe(false)
  })
})

describe('humaniseCode', () => {
  it('turns a stored code into prose', () => {
    expect(humaniseCode('UNDER_REVIEW')).toBe('Under review')
    expect(humaniseCode('OPEN')).toBe('Open')
  })

  it('leaves anything that is not a code alone', () => {
    // A free-text value must survive untouched — lowercasing a customer name or
    // a batch number would misreport what the filter actually matches.
    expect(humaniseCode('Acme Ltd')).toBe('Acme Ltd')
    expect(humaniseCode('')).toBe('')
    expect(humaniseCode(null)).toBe('')
  })
})

describe('definitionSentence', () => {
  it('describes the simplest possible metric', () => {
    expect(definitionSentence(countDef(), { grain: 'month' }, CAPA_FIELDS)).toBe(
      'Counts records, counted by Raised, reported monthly.',
    )
  })

  it('uses the date field the definition names, not the first one', () => {
    // The distinction the WHEN section exists to make visible: the same records
    // counted by a different date are a different metric.
    expect(
      definitionSentence(countDef({ timeField: 'closed_at' }), { grain: 'month' }, CAPA_FIELDS),
    ).toBe('Counts records, counted by Closed, reported monthly.')
  })

  it('humanises filter values rather than printing stored codes', () => {
    const def = countDef({
      filters: [{ field: 'status_id', op: 'in', values: ['UNDER_REVIEW'] }],
    })
    expect(definitionSentence(def, { grain: 'month' }, CAPA_FIELDS)).toBe(
      'Counts records where Status is Under review, counted by Raised, reported monthly.',
    )
  })

  it('joins several values with "or" and several filters with "and"', () => {
    // "and" between filters is not a style choice: the compiler joins predicates
    // with AND and cannot express anything else, so the sentence must not imply
    // a metric could be built any other way.
    const def = countDef({
      filters: [
        { field: 'status_id', op: 'in', values: ['OPEN', 'DRAFT'] },
        { field: 'priority_id', op: 'in', values: ['HIGH'] },
      ],
    })
    expect(definitionSentence(def, { grain: 'month' }, CAPA_FIELDS)).toBe(
      'Counts records where Status is Open or Draft and Priority is High, ' +
        'counted by Raised, reported monthly.',
    )
  })

  it('reads the valueless operators the way a person would say them', () => {
    const isSet = countDef({ filters: [{ field: 'owner_id', op: 'isNotNull', values: [] }] })
    expect(definitionSentence(isSet, { grain: 'month' }, CAPA_FIELDS)).toContain('where Owner is set')

    const notSet = countDef({ filters: [{ field: 'owner_id', op: 'isNull', values: [] }] })
    expect(definitionSentence(notSet, { grain: 'month' }, CAPA_FIELDS)).toContain(
      'where Owner is not set',
    )
  })

  it('negates a notIn filter', () => {
    const def = countDef({
      filters: [{ field: 'status_id', op: 'notIn', values: ['CANCELLED'] }],
    })
    expect(definitionSentence(def, { grain: 'month' }, CAPA_FIELDS)).toContain(
      'where Status is not Cancelled',
    )
  })

  it('names every breakdown', () => {
    const def = countDef({ groupBy: ['department_id', 'priority_id'] })
    expect(definitionSentence(def, { grain: 'quarter' }, CAPA_FIELDS)).toBe(
      'Counts records, counted by Raised, grouped by Department and Priority, reported quarterly.',
    )
  })

  it('opens with the compiler’s wording for each measure', () => {
    const cases = [
      [{ type: MEASURES.COUNT }, 'Counts records'],
      [{ type: MEASURES.COUNT_DISTINCT, field: 'owner_id' }, 'Counts distinct values'],
      [{ type: MEASURES.SUM, field: 'risk_score' }, 'Adds up values'],
      [{ type: MEASURES.AVG, field: 'risk_score' }, 'Averages values'],
      [{ type: MEASURES.RATIO, numerator: [] }, 'The share of records'],
    ]
    for (const [measure, opening] of cases) {
      const sentence = definitionSentence(countDef({ measure }), { grain: 'month' }, CAPA_FIELDS)
      expect(sentence.startsWith(opening)).toBe(true)
    }
  })

  it('does not describe a ratio’s numerator', () => {
    // The compiler does not describe it either. Saying anything here would be
    // this helper claiming knowledge the rest of the product does not have.
    const def = countDef({
      measure: {
        type: MEASURES.RATIO,
        numerator: [{ field: 'status_id', op: 'in', values: ['CLOSED'] }],
      },
    })
    const sentence = definitionSentence(def, { grain: 'month' }, CAPA_FIELDS)
    expect(sentence).toBe('The share of records, counted by Raised, reported monthly.')
    expect(sentence).not.toContain('Closed')
  })

  it('stays silent rather than printing half a sentence', () => {
    const grain = { grain: 'month' }
    // Nothing chosen yet.
    expect(definitionSentence(blankDefinition(), grain, CAPA_FIELDS)).toBeNull()
    // Source but no date.
    expect(definitionSentence({ ...blankDefinition(), sourceTable: 'capas' }, grain, CAPA_FIELDS)).toBeNull()
    // A filter mid-edit, with no value typed yet.
    expect(
      definitionSentence(
        countDef({ filters: [{ field: 'status_id', op: 'in', values: [] }] }),
        grain,
        CAPA_FIELDS,
      ),
    ).toBeNull()
    // A measure that needs a field and has not got one.
    expect(
      definitionSentence(countDef({ measure: { type: MEASURES.SUM } }), grain, CAPA_FIELDS),
    ).toBeNull()
  })

  it('refuses to describe a field the registry does not have', () => {
    // The guard that matters for correctness: a column left over from another
    // table would otherwise be described as if it were part of this metric.
    const def = countDef({ filters: [{ field: 'site_id', op: 'in', values: ['X'] }] })
    expect(definitionSentence(def, { grain: 'month' }, CAPA_FIELDS)).toBeNull()

    const grouped = countDef({ groupBy: ['site_id'] })
    expect(definitionSentence(grouped, { grain: 'month' }, CAPA_FIELDS)).toBeNull()
  })

  it('never invents a figure', () => {
    // The property the whole preview design rests on: this helper describes a
    // metric, it does not compute one, so no digit can reach the panel.
    const def = countDef({
      filters: [{ field: 'status_id', op: 'in', values: ['OPEN'] }],
      groupBy: ['department_id'],
    })
    expect(definitionSentence(def, { grain: 'month' }, CAPA_FIELDS)).not.toMatch(/\d/)
  })
})

describe('definitionProblem', () => {
  const named = { name: 'Open CAPAs', grain: 'month' }

  it('accepts a complete definition', () => {
    expect(definitionProblem(countDef(), named, 3)).toBeNull()
  })

  it('asks for each missing piece in turn, as a sentence', () => {
    expect(definitionProblem(countDef(), { name: '  ' }, 3)).toBe('Give the metric a name.')
    expect(definitionProblem(blankDefinition(), named, 3)).toBe('Choose what this metric counts.')
    expect(
      definitionProblem({ ...blankDefinition(), sourceTable: 'capas' }, named, 3),
    ).toBe('Choose which date it is counted by.')
  })

  it('does not require a breakdown', () => {
    // A metric with no breakdown is a total, which is valid and common. A
    // "choose a breakdown" message would be wrong, not merely unhelpful.
    expect(definitionProblem(countDef({ groupBy: [] }), named, 3)).toBeNull()
  })

  it('enforces the rollup’s dimension cap, quoting it', () => {
    const def = countDef({ groupBy: ['status_id', 'priority_id', 'department_id', 'owner_id'] })
    expect(definitionProblem(def, named, 3)).toBe('A metric can be grouped by at most 3 things.')
    // The cap belongs to the rollup, so the message follows it rather than a
    // constant baked in here.
    expect(definitionProblem(def, named, 4)).toBeNull()
  })

  it('catches an incomplete filter', () => {
    expect(
      definitionProblem(countDef({ filters: [{ field: null, op: 'in', values: [] }] }), named, 3),
    ).toBe('Every filter needs a field.')
    expect(
      definitionProblem(
        countDef({ filters: [{ field: 'status_id', op: 'in', values: [] }] }),
        named,
        3,
      ),
    ).toBe('Every filter needs at least one value.')
  })

  it('requires a numerator for a percentage', () => {
    expect(
      definitionProblem(countDef({ measure: { type: MEASURES.RATIO, numerator: [] } }), named, 3),
    ).toBe('A percentage needs a condition for the top of the fraction.')
  })
})
