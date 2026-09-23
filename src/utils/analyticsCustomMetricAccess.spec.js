import { describe, it, expect } from 'vitest'
import {
  MEASURES,
  canCreateCustomMetrics,
  canUpdateCustomMetrics,
  canDeleteCustomMetrics,
  humaniseCode,
  reportingKeyOptions,
  customFilterFields,
  customFieldRef,
  customFieldKey,
  expandCustomFilters,
  foldCustomFilters,
  customGroupFields,
  expandCustomGroupBy,
  foldCustomGroupBy,
  blankDefinition,
  definitionProblem,
  definitionSentence,
  metricState,
  metricStateRank,
  METRIC_STATE_OPTIONS,
  problemSection,
  sectionSummary,
  BUILDER_SECTIONS,
  reportingFields,
  eavFilterConflict,
  FIELD_HELP,
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

describe('custom metric write gates', () => {
  // Three separate verbs since the 2026-09-21 permission split. Before it these
  // were one `manage` key, so "may author but not destroy" could not be said.
  it('each gate requires its own permission', () => {
    expect(canCreateCustomMetrics({ canCreate: true })).toBe(true)
    expect(canCreateCustomMetrics({ canCreate: false })).toBe(false)
    expect(canCreateCustomMetrics()).toBe(false)

    expect(canUpdateCustomMetrics({ canUpdate: true })).toBe(true)
    expect(canUpdateCustomMetrics({ canUpdate: false })).toBe(false)
    expect(canUpdateCustomMetrics()).toBe(false)

    expect(canDeleteCustomMetrics({ canDelete: true })).toBe(true)
    expect(canDeleteCustomMetrics({ canDelete: false })).toBe(false)
    expect(canDeleteCustomMetrics()).toBe(false)
  })

  // The case the split exists for, and the one the backend was measured on:
  // create WITHOUT delete. Asserted here so a future refactor that collapses
  // these back into one flag fails loudly.
  it('lets create and delete disagree', () => {
    const authorOnly = { canCreate: true, canUpdate: true, canDelete: false }
    expect(canCreateCustomMetrics(authorOnly)).toBe(true)
    expect(canUpdateCustomMetrics(authorOnly)).toBe(true)
    expect(canDeleteCustomMetrics(authorOnly)).toBe(false)
  })

  // And the read-only viewer: sees definitions, writes nothing.
  it('denies every write to a read-only viewer', () => {
    const viewer = {}
    expect(canCreateCustomMetrics(viewer)).toBe(false)
    expect(canUpdateCustomMetrics(viewer)).toBe(false)
    expect(canDeleteCustomMetrics(viewer)).toBe(false)
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

/**
 * A promoted FormTemplate, in the shape CustomMetricsHome hands the builder.
 * Nested children and an un-flagged field are both present on purpose: the
 * walker has to descend containers and skip anything not marked reportable.
 */
const LEAD_TEMPLATE = {
  isModule: true,
  internalName: 'lead_crm',
  schema: [
    { name: 'input_1', type: 'input', label: 'Lead name' },
    {
      name: 'section_1',
      type: 'section',
      label: 'Commercials',
      children: [
        {
          name: 'number_1',
          type: 'number',
          label: 'Deal Value',
          reporting: { enabled: true, key: 'deal_value' },
        },
        {
          name: 'select_2',
          type: 'select',
          label: 'Lead Status',
          reporting: { enabled: true, key: 'lead_status' },
        },
      ],
    },
    {
      name: 'select_1',
      type: 'select',
      label: 'Lead Source',
      reporting: { enabled: true, key: 'lead_source' },
    },
    // Flag off — declared but not reported on, so not measurable.
    { name: 'input_2', type: 'input', label: 'Company', reporting: { enabled: false, key: 'co' } },
  ],
}

describe('reportingKeyOptions', () => {
  it('offers every reportable key, including ones nested in a section', () => {
    expect(reportingKeyOptions([LEAD_TEMPLATE], 'lead_crm').map((o) => o.value)).toEqual([
      'deal_value',
      'lead_source',
      'lead_status',
    ])
  })

  it('labels by the field name the author gave, keeping the key visible', () => {
    const [first] = reportingKeyOptions([LEAD_TEMPLATE], 'lead_crm')
    expect(first).toEqual({ value: 'deal_value', label: 'Deal Value (deal_value)' })
  })

  it('skips fields whose reporting flag is off', () => {
    expect(reportingKeyOptions([LEAD_TEMPLATE], 'lead_crm').map((o) => o.value)).not.toContain('co')
  })

  // A built-in module has no FormTemplate claiming it, so the picker must fall
  // back to the typed input rather than rendering an empty dropdown.
  it('returns nothing for a module no template claims', () => {
    expect(reportingKeyOptions([LEAD_TEMPLATE], 'capa')).toEqual([])
  })

  it('returns nothing when no module is chosen yet', () => {
    expect(reportingKeyOptions([LEAD_TEMPLATE], null)).toEqual([])
  })

  it('survives a template with no schema', () => {
    const bare = { isModule: true, internalName: 'lead_crm' }
    expect(reportingKeyOptions([bare], 'lead_crm')).toEqual([])
  })
})

/**
 * The EAV sum/avg guard — mirrored from the compiler so the form stops the
 * author before the save rather than after it.
 */
describe('definitionProblem — measuring one answer on a custom module', () => {
  const eavMeta = { name: 'Total deal value', moduleId: 'lead_crm' }
  function eavDef(overrides = {}) {
    return {
      sourceTable: 'analytics_field_values',
      timeField: 'occurred_at',
      measure: { type: MEASURES.SUM, field: 'numeric_value' },
      filters: [],
      groupBy: [],
      ...overrides,
    }
  }
  const pinned = [{ field: 'reporting_key', op: 'in', values: ['deal_value'] }]

  it('refuses a sum that does not say which answer', () => {
    expect(definitionProblem(eavDef(), eavMeta, 3)).toBe(
      'Choose which answer to measure, or break the results down by Field.',
    )
  })

  it('refuses an average the same way', () => {
    expect(
      definitionProblem(
        eavDef({ measure: { type: MEASURES.AVG, field: 'numeric_value' } }),
        eavMeta,
        3,
      ),
    ).toBe('Choose which answer to measure, or break the results down by Field.')
  })

  it('accepts one pinned to a single field', () => {
    expect(definitionProblem(eavDef({ filters: pinned }), eavMeta, 3)).toBeNull()
  })

  // Two values re-admit exactly the mixing the rule exists to prevent.
  it('refuses two fields at once', () => {
    expect(
      definitionProblem(
        eavDef({ filters: [{ field: 'reporting_key', op: 'in', values: ['deal_value', 'score'] }] }),
        eavMeta,
        3,
      ),
    ).toBe('Choose which answer to measure, or break the results down by Field.')
  })

  // notIn leaves every other field in, so it pins nothing.
  it('refuses a notIn filter', () => {
    expect(
      definitionProblem(
        eavDef({ filters: [{ field: 'reporting_key', op: 'notIn', values: ['deal_value'] }] }),
        eavMeta,
        3,
      ),
    ).toBe('Choose which answer to measure, or break the results down by Field.')
  })

  // Breaking down BY field gives each one its own series, so nothing is ever
  // added across two — the compiler accepts this shape and so must the form.
  it('accepts a breakdown by field instead of a filter', () => {
    expect(definitionProblem(eavDef({ groupBy: ['reporting_key'] }), eavMeta, 3)).toBeNull()
  })

  // Counting is already per-record (count(DISTINCT record_id)), so it does not
  // need the pin — only sum and avg read numeric_value.
  it('does not ask a count to name an answer', () => {
    expect(
      definitionProblem(eavDef({ measure: { type: MEASURES.COUNT } }), eavMeta, 3),
    ).toBeNull()
  })

  // On a physical table the column IS the field, so the rule must not apply.
  it('leaves a physical source alone', () => {
    expect(
      definitionProblem(
        {
          sourceTable: 'audit_findings',
          timeField: 'created_at',
          measure: { type: MEASURES.SUM, field: 'risk_score' },
          filters: [],
          groupBy: [],
        },
        { name: 'Risk', moduleId: 'audit_findings' },
        3,
      ),
    ).toBeNull()
  })
})

describe('metricState', () => {
  // The precedence, stated as tests, because the list's status filter and the
  // card's badge both read this function. If they ever disagreed the page would
  // show a card whose badge contradicts the filter that selected it.
  it('reports a compile failure ahead of everything else', () => {
    // Published AND broken is reachable: the server clears publication when a
    // definition stops compiling, but the client row can still carry both until
    // it syncs. The error is the fact worth showing either way.
    expect(metricState({ compileError: 'no such field: foo', isPublished: true }, true)).toBe(
      'error',
    )
    expect(metricState({ compileError: 'no such field: foo', isPublished: false }, false)).toBe(
      'error',
    )
  })

  it('calls a published metric with no rollup row "preparing"', () => {
    expect(metricState({ isPublished: true }, false)).toBe('preparing')
  })

  it('is published only once the catalog has computed it', () => {
    expect(metricState({ isPublished: true }, true)).toBe('published')
  })

  it('treats an unpublished metric as a draft regardless of the catalog', () => {
    expect(metricState({ isPublished: false }, false)).toBe('draft')
    // A catalog row can outlive unpublication until the next rollup prunes it;
    // the stored intent is what decides, not the leftover aggregate.
    expect(metricState({ isPublished: false }, true)).toBe('draft')
  })

  it('does not throw on a missing metric', () => {
    expect(metricState(undefined, false)).toBe('draft')
  })
})

describe('metricStateRank', () => {
  it('sorts the states the way the filter lists them', () => {
    const byRank = METRIC_STATE_OPTIONS.map((o) => o.value)
      .slice()
      .sort((a, b) => metricStateRank(a) - metricStateRank(b))
    expect(byRank).toEqual(METRIC_STATE_OPTIONS.map((o) => o.value))
  })

  it('puts what needs action first and drafts last', () => {
    expect(metricStateRank('error')).toBeLessThan(metricStateRank('published'))
    expect(metricStateRank('preparing')).toBeLessThan(metricStateRank('published'))
    expect(metricStateRank('published')).toBeLessThan(metricStateRank('draft'))
  })

  it('sends an unknown state to the end rather than the front', () => {
    expect(metricStateRank('something-new')).toBeGreaterThan(metricStateRank('draft'))
  })
})

describe('problemSection', () => {
  // ⚠ These pair message-for-message with definitionProblem above. The two live
  // in one file precisely so a reworded message and its placement can be seen
  // together; a miss here is silent — the error just falls back to the footer.
  it('places every message definitionProblem can return', () => {
    expect(problemSection('Give the metric a name.')).toBe(BUILDER_SECTIONS.WHAT)
    expect(problemSection('Choose what this metric counts.')).toBe(BUILDER_SECTIONS.RECORDS)
    expect(problemSection('Choose the field to measure.')).toBe(BUILDER_SECTIONS.RECORDS)
    expect(problemSection('A percentage needs a condition for the top of the fraction.')).toBe(
      BUILDER_SECTIONS.RECORDS,
    )
    expect(problemSection('Choose which date it is counted by.')).toBe(BUILDER_SECTIONS.WHEN)
    expect(problemSection('Every filter needs a field.')).toBe(BUILDER_SECTIONS.FILTERS)
    expect(problemSection('Every condition needs at least one value.')).toBe(
      BUILDER_SECTIONS.FILTERS,
    )
    expect(problemSection('A metric can be grouped by at most 3 things.')).toBe(
      BUILDER_SECTIONS.BREAKDOWN,
    )
  })

  it('returns null when there is no problem at all', () => {
    expect(problemSection(null)).toBeNull()
  })

  it('returns null for a message it does not recognise', () => {
    // Read by the caller as "footer only". An unplaced message beats a
    // confidently misplaced one.
    expect(problemSection('Something the compiler said')).toBeNull()
  })
})

describe('sectionSummary', () => {
  it('names the date a record counts by', () => {
    // The single most consequential choice in the form. A tick would hide it.
    expect(sectionSummary(BUILDER_SECTIONS.WHEN, { timeLabel: 'Raised' })).toBe('Counted by Raised')
  })

  it('pairs the metric name with its module', () => {
    expect(sectionSummary(BUILDER_SECTIONS.WHAT, { name: 'Open CAPAs', moduleLabel: 'Capa' })).toBe(
      'Open CAPAs · Capa',
    )
  })

  it('treats no filters as an answer, not a gap', () => {
    // "Every record counts" is a decision the author made; collapsing it to
    // nothing would hide it.
    expect(sectionSummary(BUILDER_SECTIONS.FILTERS, { filterCount: 0 })).toBe('Every record counts')
    expect(sectionSummary(BUILDER_SECTIONS.FILTERS, { filterCount: 1 })).toBe('1 filter')
    expect(sectionSummary(BUILDER_SECTIONS.FILTERS, { filterCount: 3 })).toBe('3 filters')
  })

  it('returns null while a section is incomplete, so it stays open', () => {
    expect(sectionSummary(BUILDER_SECTIONS.WHAT, { name: '   ' })).toBeNull()
    expect(sectionSummary(BUILDER_SECTIONS.WHEN, {})).toBeNull()
    expect(sectionSummary(BUILDER_SECTIONS.RECORDS, { recordsLabel: 'Capas' })).toBeNull()
  })

  it('says so when no breakdown was chosen', () => {
    expect(sectionSummary(BUILDER_SECTIONS.BREAKDOWN, {})).toBe('No breakdown')
  })
})

/** A custom module's form, in the shape form_templates.schema stores. */
const LEAD_CRM = [
  {
    isModule: true,
    internalName: 'lead_crm',
    schema: [
      { name: 'input_1', type: 'input', label: 'Lead name' },
      {
        name: 'select_1',
        type: 'select',
        label: 'Lead Source',
        options: ['EMAIL', 'SMS', 'WEB', 'MANUAL'],
        reporting: { enabled: true, key: 'lead_source' },
      },
      {
        name: 'number_1',
        type: 'number',
        label: 'Deal Value',
        reporting: { enabled: true, key: 'deal_value' },
      },
      {
        name: 'select_2',
        type: 'select',
        label: 'Lead Status',
        options: ['OPEN', 'PROGRESS', 'CLOSED'],
        reporting: { enabled: true, key: 'lead_status' },
      },
    ],
  },
]

describe('reportingFields', () => {
  it('returns only the fields marked reportable', () => {
    // "Lead name" carries no reporting block, so nothing about it is stored in
    // analytics_field_values and a metric could not reference it.
    const keys = reportingFields(LEAD_CRM, 'lead_crm').map((f) => f.key)
    expect(keys).toEqual(['deal_value', 'lead_source', 'lead_status'])
  })

  it('carries a dropdown field’s legal answers', () => {
    // Straight from the form's `options` — the ONLY place the legal set exists.
    // Reading distinct values out of the data instead would miss an option
    // nobody has picked yet and would resurrect one since renamed.
    const source = reportingFields(LEAD_CRM, 'lead_crm').find((f) => f.key === 'lead_source')
    expect(source.options).toEqual(['EMAIL', 'SMS', 'WEB', 'MANUAL'])
    expect(source.type).toBe('select')
  })

  it('leaves a non-dropdown field’s answers open', () => {
    // A number has no fixed set, and a picker built from nothing is a control
    // with no way past.
    const value = reportingFields(LEAD_CRM, 'lead_crm').find((f) => f.key === 'deal_value')
    expect(value.options).toEqual([])
  })

  it('returns nothing for a module it cannot see', () => {
    expect(reportingFields(LEAD_CRM, 'not_a_module')).toEqual([])
    expect(reportingFields([], 'lead_crm')).toEqual([])
    expect(reportingFields(LEAD_CRM, null)).toEqual([])
  })
})

describe('eavFilterConflict', () => {
  const eav = (filters) => ({ sourceTable: 'analytics_field_values', filters })

  it('warns when two different custom fields are filtered at once', () => {
    // analytics_field_values holds one row per (record, field), and the compiler
    // ANDs filters into a single WHERE — so this asks one row to be two fields.
    // It compiles, it publishes, and it counts nothing.
    const msg = eavFilterConflict(
      eav([
        { field: 'reporting_key', op: 'in', values: ['lead_source'] },
        { field: 'reporting_key', op: 'in', values: ['lead_status'] },
      ]),
    )
    expect(msg).toContain('will count nothing')
    expect(msg).toContain('break the')
  })

  it('stays silent for the one-field case the compiler requires', () => {
    expect(
      eavFilterConflict(eav([{ field: 'reporting_key', op: 'in', values: ['deal_value'] }])),
    ).toBeNull()
  })

  it('stays silent on a real table, where two filters are two columns', () => {
    // The conflict is a property of EAV storage, not of filtering.
    expect(
      eavFilterConflict({
        sourceTable: 'capas',
        filters: [
          { field: 'status_id', op: 'in', values: ['OPEN'] },
          { field: 'priority_id', op: 'in', values: ['HIGH'] },
        ],
      }),
    ).toBeNull()
  })

  it('ignores filters on the other registered columns', () => {
    // site_id and occurred_at are real columns on the projection, so they AND
    // with a reporting_key filter perfectly well.
    expect(
      eavFilterConflict(
        eav([
          { field: 'reporting_key', op: 'in', values: ['lead_source'] },
          { field: 'site_id', op: 'isNotNull' },
        ]),
      ),
    ).toBeNull()
  })
})

describe('FIELD_HELP', () => {
  it('explains every control the dialog attaches an info icon to', () => {
    for (const key of [
      'module', 'records', 'measure', 'measureField', 'filters',
      'numerator', 'timeField', 'breakdown', 'direction', 'grain',
    ]) {
      expect(FIELD_HELP[key], key).toBeTruthy()
    }
  })

  it('names the clause each control compiles to', () => {
    // The point of these: the rest of the form deliberately avoids SQL, so the
    // info icon is the one place a developer can find out what it becomes.
    expect(FIELD_HELP.filters).toContain('WHERE')
    expect(FIELD_HELP.breakdown).toContain('GROUP BY')
    expect(FIELD_HELP.measure).toContain('count(*)')
  })

  it('says direction never changes the figure', () => {
    // The one control people assume is part of the calculation.
    expect(FIELD_HELP.direction).toContain('never changes the figure')
  })
})

/**
 * The custom-field translation layer.
 *
 * A custom module has no table: "Lead Status is OPEN" is two predicates on one
 * EAV row, not one predicate on a column. The builder shows one row and expands
 * it on save, so these tests are mostly about the two directions agreeing.
 */
describe('custom-module field translation', () => {
  const FORM_FIELDS = [
    { key: 'lead_source', label: 'Lead Source', type: 'select', options: ['WEB', 'EMAIL'] },
    { key: 'lead_status', label: 'Lead Status', type: 'select', options: ['OPEN', 'CLOSED'] },
    { key: 'deal_value', label: 'Deal Value', type: 'number', options: [] },
  ]
  const REGISTRY = [
    { value: 'numeric_value', label: 'Value' },
    { value: 'occurred_at', label: 'Occurred' },
    { value: 'reporting_key', label: 'Field' },
    { value: 'text_value', label: 'Answer' },
    { value: 'site_id', label: 'Site' },
  ]

  it('offers the form\'s own fields and hides the storage shape', () => {
    const out = customFilterFields(REGISTRY, FORM_FIELDS)
    expect(out.map((o) => o.label)).toEqual([
      'Lead Source',
      'Lead Status',
      'Deal Value',
      'Occurred',
      'Site',
    ])
    // Field / Answer / Value are the EAV plumbing — never offered directly.
    expect(out.map((o) => o.value)).not.toContain('reporting_key')
    expect(out.map((o) => o.value)).not.toContain('text_value')
    expect(out.map((o) => o.value)).not.toContain('numeric_value')
  })

  it('expands one virtual row into the pair the compiler expects', () => {
    expect(
      expandCustomFilters([{ field: customFieldRef('lead_status'), op: 'in', values: ['OPEN'] }]),
    ).toEqual([
      { field: 'reporting_key', op: 'in', values: ['lead_status'] },
      { field: 'text_value', op: 'in', values: ['OPEN'] },
    ])
  })

  // "Leads that recorded a source" is a legal question, and the bare pin is
  // also the shape the sum/avg guard requires.
  it('expands a value-less row to the key pin alone', () => {
    expect(
      expandCustomFilters([{ field: customFieldRef('deal_value'), op: 'in', values: [] }]),
    ).toEqual([{ field: 'reporting_key', op: 'in', values: ['deal_value'] }])
  })

  it('leaves real registry columns untouched', () => {
    const real = [{ field: 'site_id', op: 'in', values: ['s1'] }]
    expect(expandCustomFilters(real)).toEqual(real)
  })

  it('round-trips an expanded pair back to one row', () => {
    const virt = [{ field: customFieldRef('lead_source'), op: 'in', values: ['WEB', 'EMAIL'] }]
    expect(foldCustomFilters(expandCustomFilters(virt))).toEqual(virt)
  })

  it('round-trips a mix of virtual and real rows', () => {
    const virt = [
      { field: customFieldRef('lead_status'), op: 'in', values: ['OPEN'] },
      { field: 'site_id', op: 'in', values: ['s1'] },
    ]
    expect(foldCustomFilters(expandCustomFilters(virt))).toEqual(virt)
  })

  // ⚠ A definition written before this layer existed, or through the API, is
  // not required to match the folded shape. Rewriting one would silently change
  // a filter the author never touched.
  it('leaves an ambiguous multi-key pin unfolded', () => {
    const raw = [
      { field: 'reporting_key', op: 'in', values: ['lead_source', 'lead_status'] },
      { field: 'text_value', op: 'in', values: ['WEB'] },
    ]
    expect(foldCustomFilters(raw)).toEqual(raw)
  })

  it('leaves a lone Answer row unfolded', () => {
    const raw = [{ field: 'text_value', op: 'in', values: ['WEB'] }]
    expect(foldCustomFilters(raw)).toEqual(raw)
  })

  it('reads the key back out of a virtual reference', () => {
    expect(customFieldKey(customFieldRef('lead_status'))).toBe('lead_status')
    expect(customFieldKey('site_id')).toBeNull()
  })
})

/**
 * The breakdown half of the same translation.
 *
 * Sharper than the filter half: grouping by the raw `Answer` column with no
 * field pinned draws one chart containing every field's answers — on lead_crm
 * that is PROGRESS, WEB, OPEN, EMAIL and SMS side by side, statuses and sources
 * mixed. Real bars, meaningless chart, no error.
 */
describe('custom-module breakdown translation', () => {
  const FORM_FIELDS = [
    { key: 'lead_source', label: 'Lead Source' },
    { key: 'lead_status', label: 'Lead Status' },
  ]
  const REGISTRY = [
    { value: 'reporting_key', label: 'Field' },
    { value: 'text_value', label: 'Answer' },
    { value: 'site_id', label: 'Site' },
  ]

  it('replaces Answer with the form\'s fields but keeps Field', () => {
    const out = customGroupFields(REGISTRY, FORM_FIELDS)
    expect(out.map((o) => o.label)).toEqual(['Lead Source', 'Lead Status', 'Field', 'Site'])
    expect(out.map((o) => o.value)).not.toContain('text_value')
    // "One series per reportable field" is a real question and is not
    // expressible any other way, so Field survives.
    expect(out.map((o) => o.value)).toContain('reporting_key')
  })

  it('expands a virtual breakdown into text_value plus its pin', () => {
    expect(expandCustomGroupBy([customFieldRef('lead_source')])).toEqual({
      groupBy: ['text_value'],
      pins: [{ field: 'reporting_key', op: 'in', values: ['lead_source'] }],
    })
  })

  it('leaves real columns alone and emits no pin', () => {
    expect(expandCustomGroupBy(['site_id'])).toEqual({ groupBy: ['site_id'], pins: [] })
  })

  // Two pins would ask one row to be two fields, which counts nothing.
  it('keeps only the first custom field when two are chosen', () => {
    const out = expandCustomGroupBy([
      customFieldRef('lead_source'),
      customFieldRef('lead_status'),
    ])
    expect(out.groupBy).toEqual(['text_value'])
    expect(out.pins).toEqual([{ field: 'reporting_key', op: 'in', values: ['lead_source'] }])
  })

  it('round-trips a virtual breakdown', () => {
    const virt = [customFieldRef('lead_source')]
    const { groupBy, pins } = expandCustomGroupBy(virt)
    expect(foldCustomGroupBy(groupBy, pins)).toEqual(virt)
  })

  it('round-trips a virtual breakdown mixed with a real column', () => {
    const virt = [customFieldRef('lead_status'), 'site_id']
    const { groupBy, pins } = expandCustomGroupBy(virt)
    expect(foldCustomGroupBy(groupBy, pins)).toEqual(virt)
  })

  // With no pin the stored text_value means what it says, so it is left alone.
  it('leaves an unpinned text_value breakdown unfolded', () => {
    expect(foldCustomGroupBy(['text_value'], [])).toEqual(['text_value'])
  })

  it('leaves it unfolded when two fields are pinned', () => {
    const filters = [{ field: 'reporting_key', op: 'in', values: ['a', 'b'] }]
    expect(foldCustomGroupBy(['text_value'], filters)).toEqual(['text_value'])
  })
})
