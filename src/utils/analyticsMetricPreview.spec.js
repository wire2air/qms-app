import { describe, it, expect } from 'vitest'
import {
  draftCatalogRow,
  previewPayload,
  unitForDefinition,
  PREVIEW_METRIC_KEY,
} from './analyticsMetricPreview.js'
import { vizOptionsFor, dimensionOptionsFor, clampQuestion } from './analyticsViz.js'

/**
 * The draft row must say what analytics_compile_custom_metric will say — the
 * unit gates the visualisations and the dimension key round-trips as
 * `params.dimension`. These cases mirror the compiler's measure and group-by
 * blocks (20260918030050-functions.sql).
 */

const FIELDS = [
  {
    sourceTable: 'capas',
    columnName: 'status_id',
    label: 'Status',
    kind: 'text',
    groupable: true,
    filterKey: 'statusId',
  },
  {
    sourceTable: 'capas',
    columnName: 'site_id',
    label: 'Site',
    kind: 'text',
    groupable: true,
    filterKey: 'siteId',
  },
  {
    sourceTable: 'capas',
    columnName: 'root_cause',
    label: 'Root cause',
    kind: 'text',
    groupable: true,
    filterKey: null,
  },
  {
    sourceTable: 'other',
    columnName: 'status_id',
    label: 'Other status',
    kind: 'text',
    groupable: true,
  },
]

function def(extra = {}) {
  return { sourceTable: 'capas', timeField: 'created_at', measure: { type: 'count' }, ...extra }
}

describe('unitForDefinition — the compiler’s v_unit', () => {
  it.each([
    ['count', 'count'],
    ['sum', 'count'],
    ['avg', 'days'],
    ['duration', 'days'],
    ['ratio', 'percent'],
  ])('%s → %s', (type, unit) => {
    expect(unitForDefinition(def({ measure: { type } }))).toBe(unit)
  })

  it('defaults a missing measure to count, like the compiler', () => {
    expect(unitForDefinition({ sourceTable: 'capas' })).toBe('count')
  })
})

describe('draftCatalogRow', () => {
  it('is shaped like a metric_catalog row, keyed as the preview placeholder', () => {
    const row = draftCatalogRow({
      name: 'Open CAPAs',
      moduleId: 'capa',
      direction: 'lower_is_better',
      grain: 'week',
      definition: def(),
      fields: FIELDS,
    })
    expect(row).toMatchObject({
      metricKey: PREVIEW_METRIC_KEY,
      name: 'Open CAPAs',
      moduleId: 'capa',
      unit: 'count',
      direction: 'lower_is_better',
      defaultGrain: 'week',
      dimensions: [],
      drill: null,
      tier: null,
    })
  })

  it('keys dimensions from the LABEL, as the compiler does, and reads only the source table', () => {
    const row = draftCatalogRow({
      moduleId: 'capa',
      definition: def({ groupBy: ['status_id', 'root_cause'] }),
      fields: FIELDS,
    })
    expect(row.dimensions).toEqual([
      { key: 'status', expr: 'status_id', filterKey: 'statusId', label: 'Status' },
      { key: 'root_cause', expr: 'root_cause', filterKey: null, label: 'Root cause' },
    ])
  })

  it('names an EAV text_value split after its single pinned reporting_key', () => {
    const eavFields = [
      {
        sourceTable: 'analytics_field_values',
        columnName: 'text_value',
        label: 'Answer',
        groupable: true,
      },
    ]
    const definition = {
      sourceTable: 'analytics_field_values',
      timeField: 'created_at',
      filters: [{ field: 'reporting_key', op: 'in', values: ['lead_source'] }],
      groupBy: ['text_value'],
    }
    const row = draftCatalogRow({ moduleId: 'm', definition, fields: eavFields })
    expect(row.dimensions[0]).toMatchObject({
      key: 'lead_source',
      label: 'Lead Source',
      expr: 'text_value',
    })
  })

  it('drives the viz rules exactly like a catalog row', () => {
    const ratio = draftCatalogRow({
      moduleId: 'capa',
      definition: def({ measure: { type: 'ratio' }, groupBy: ['status_id'] }),
      fields: FIELDS,
    })
    const ids = vizOptionsFor(ratio).map((r) => r.id)
    expect(ids).not.toContain('donut')
    expect(ids).not.toContain('stacked_bar')
    expect(dimensionOptionsFor(ratio, 'line').map((o) => o.value)).toEqual(['status'])
    // A declared split makes the default a splittable viz, not a single number.
    expect(clampQuestion(ratio, { metricKey: PREVIEW_METRIC_KEY }).viz).toBe('line')
    expect(clampQuestion(ratio, { viz: 'bar' }).dimension).toBe('status')
  })
})

describe('previewPayload', () => {
  it('is null until the source and date are chosen', () => {
    expect(previewPayload({ moduleId: 'capa', definition: { sourceTable: 'capas' } })).toBeNull()
    expect(previewPayload({ definition: def() })).toBeNull()
  })

  it('is a frozen snapshot, detached from the form it came from', () => {
    const definition = def({ groupBy: ['status_id'] })
    const payload = previewPayload({
      moduleId: 'capa',
      grain: 'month',
      direction: 'neutral',
      definition,
    })
    definition.groupBy.push('site_id')
    expect(Object.isFrozen(payload)).toBe(true)
    expect(payload.definition.groupBy).toEqual(['status_id'])
  })
})
