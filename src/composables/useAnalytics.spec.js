import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowRef, ref } from 'vue'
import { formatMetricValue, isDrillable, drillLocation } from '@/utils/analyticsFormat.js'

/**
 * useAnalytics is where the raw GraphQL payload becomes something a component
 * may render. Two contracts are enforced here and NOWHERE ELSE, so nothing
 * downstream re-checks them:
 *
 *  1. `numeric` columns arrive as the BigFloat scalar — a STRING. Coercion
 *     happens once, here. A component must never receive '90.1098901098901099'.
 *  2. `suppressed` is a DIMENSIONED concept: it exists on metric_series and
 *     metric_breakdown and does NOT exist on metric_value. A null KPI therefore
 *     means "no data", never "withheld".
 *
 * The server query layer is stubbed: this file tests the shaping, and
 * useServerQuery.spec.js tests the fetching.
 */

const handles = []
vi.mock('@/composables/useServerQuery.js', () => ({
  useGraphQLQuery: (query, variables, options = {}) => {
    const handle = {
      query,
      variables,
      options,
      data: shallowRef(options.initial),
      error: shallowRef(null),
      loading: ref(false),
      loaded: ref(false),
      retryCount: ref(0),
      refresh: vi.fn(),
      retry: vi.fn(),
      abort: vi.fn(),
    }
    handles.push(handle)
    return handle
  },
}))

const {
  useAnalyticsEntitlement,
  useMetricCatalog,
  useMetricValue,
  useMetricSeries,
  useMetricBreakdown,
} = await import('./useAnalytics.js')

/** The handle created by the composable under test (always the latest). */
function lastHandle() {
  return handles[handles.length - 1]
}

/** Resolve the variables the composable would send. */
function varsOf(handle) {
  return typeof handle.variables === 'function' ? handle.variables() : handle.variables
}

beforeEach(() => {
  handles.length = 0
})

/* -------------------------------------------------------------- entitlement */

describe('useAnalyticsEntitlement', () => {
  it('reports null while UNKNOWN, so the page shows a skeleton not "not in your plan"', () => {
    const { entitled } = useAnalyticsEntitlement()
    expect(entitled.value).toBeNull()
    expect(lastHandle().options.initial).toBeNull()
  })

  it('reports a definite false once the server answers', () => {
    const { entitled } = useAnalyticsEntitlement()
    lastHandle().data.value = { analyticsFeatureEntitled: false }
    expect(entitled.value).toBe(false)
    expect(entitled.value).not.toBeNull() // distinguishable from "unknown"
  })

  it('reports true when entitled', () => {
    const { entitled } = useAnalyticsEntitlement()
    lastHandle().data.value = { analyticsFeatureEntitled: true }
    expect(entitled.value).toBe(true)
  })
})

/* ------------------------------------------------------------------ catalog */

describe('useMetricCatalog', () => {
  it('is empty (never undefined) before the first response', () => {
    const { metrics } = useMetricCatalog()
    expect(metrics.value).toEqual([])
  })

  it('passes an optional module filter through, defaulting to null (all modules)', () => {
    useMetricCatalog()
    expect(varsOf(lastHandle())).toEqual({ pModuleId: null })

    const moduleId = ref('capa')
    useMetricCatalog({ moduleId })
    expect(varsOf(lastHandle())).toEqual({ pModuleId: 'capa' })
    moduleId.value = 'ncr'
    expect(varsOf(lastHandle())).toEqual({ pModuleId: 'ncr' })
  })

  it('exposes whatever the server allowed — the metric list is never hardcoded', () => {
    const { metrics } = useMetricCatalog()
    lastHandle().data.value = {
      metricCatalog: { nodes: [{ metricKey: 'capa.raised', direction: 'neutral' }] },
    }
    expect(metrics.value).toHaveLength(1)
    expect(metrics.value[0].metricKey).toBe('capa.raised')
  })

  it('forwards options (e.g. the entitlement gate) to the query layer', () => {
    const enabled = () => false
    useMetricCatalog({}, { enabled })
    expect(lastHandle().options.enabled).toBe(enabled)
  })
})

/* -------------------------------------------------- metric_value (the KPI) */

/** A KPI row exactly as PostGraphile returns it: every numeric is a string. */
const KPI_NODE = {
  metricKey: 'capa.on_time_closure',
  name: 'On-time CAPA closure',
  moduleId: 'capa',
  unit: 'percent',
  value: '90.1098901098901099',
  numerator: '82',
  denominator: '91',
  comparisonValue: '85.0000000000000000',
  deltaAbs: '5.1098901098901099',
  deltaPct: '6.0116354234000000',
  direction: 'higher_is_better',
  isSignificant: true,
  effectiveScope: 'site',
  periodStart: '2026-07-01',
  periodEnd: '2026-07-31',
  bucketCount: 31,
  computedAt: '2026-08-01T02:00:00.000Z',
  tier: 'T2',
}

const KPI_NUMERIC_FIELDS = [
  'value',
  'numerator',
  'denominator',
  'comparisonValue',
  'deltaAbs',
  'deltaPct',
]

describe('useMetricValue — BigFloat strings are coerced ONCE, here', () => {
  it('a component never receives a raw string for any numeric field', () => {
    const { metric } = useMetricValue({ metricKey: 'capa.on_time_closure' })
    lastHandle().data.value = { metricValue: { nodes: [KPI_NODE] } }

    for (const field of KPI_NUMERIC_FIELDS) {
      expect(typeof KPI_NODE[field]).toBe('string') // this is what the wire carries
      expect(typeof metric.value[field]).toBe('number') // this is what the UI sees
    }
  })

  it('the coerced value supports .toFixed()-style formatting', () => {
    const { metric } = useMetricValue({ metricKey: 'capa.on_time_closure' })
    lastHandle().data.value = { metricValue: { nodes: [KPI_NODE] } }

    expect(metric.value.value.toFixed(1)).toBe('90.1')
    expect(metric.value.value).toBeCloseTo(90.1098901, 6)
    expect(formatMetricValue(metric.value.value, metric.value.unit)).toBe('90.1%')
  })

  it('does not touch the non-numeric fields', () => {
    const { metric } = useMetricValue({ metricKey: 'capa.on_time_closure' })
    lastHandle().data.value = { metricValue: { nodes: [KPI_NODE] } }

    expect(metric.value.metricKey).toBe('capa.on_time_closure')
    expect(metric.value.unit).toBe('percent')
    expect(metric.value.direction).toBe('higher_is_better')
    expect(metric.value.effectiveScope).toBe('site')
    expect(metric.value.tier).toBe('T2')
    expect(metric.value.computedAt).toBe('2026-08-01T02:00:00.000Z')
  })

  it('leaves a null isSignificant as NULL — it is not coerced to false', () => {
    const { metric } = useMetricValue({ metricKey: 'capa.raised' })
    lastHandle().data.value = {
      metricValue: { nodes: [{ ...KPI_NODE, unit: 'count', isSignificant: null }] },
    }
    expect(metric.value.isSignificant).toBeNull()
    expect(metric.value.isSignificant).not.toBe(false)
  })

  it('leaves absent numerics as null rather than 0 or NaN', () => {
    const { metric } = useMetricValue({ metricKey: 'capa.on_time_closure' })
    lastHandle().data.value = {
      metricValue: {
        nodes: [{ ...KPI_NODE, comparisonValue: null, deltaAbs: null, deltaPct: null }],
      },
    }
    for (const field of ['comparisonValue', 'deltaAbs', 'deltaPct']) {
      expect(metric.value[field]).toBeNull()
      expect(Number.isNaN(metric.value[field])).toBe(false)
    }
  })

  it('is null before the first response and for an empty connection', () => {
    const { metric } = useMetricValue({ metricKey: 'capa.raised' })
    expect(metric.value).toBeNull()
    lastHandle().data.value = { metricValue: { nodes: [] } }
    expect(metric.value).toBeNull()
  })

  it('sends the period + comparison arguments, defaulting compare to previous_period', () => {
    useMetricValue({ metricKey: 'capa.raised' })
    expect(varsOf(lastHandle())).toEqual({
      pMetricKey: 'capa.raised',
      pPeriodStart: null,
      pPeriodEnd: null,
      pCompare: 'previous_period',
    })

    useMetricValue({
      metricKey: () => 'ncr.open',
      periodStart: ref('2026-07-01'),
      periodEnd: '2026-07-31',
      compare: 'same_period_last_year',
    })
    expect(varsOf(lastHandle())).toEqual({
      pMetricKey: 'ncr.open',
      pPeriodStart: '2026-07-01',
      pPeriodEnd: '2026-07-31',
      pCompare: 'same_period_last_year',
    })
  })
})

describe('useMetricValue — metric_value has NO suppressed column', () => {
  it('does not ask the server for a suppressed field', () => {
    useMetricValue({ metricKey: 'capa.raised' })
    expect(lastHandle().query).not.toMatch(/\bsuppressed\b/)
  })

  it('never surfaces a suppressed flag on the KPI row', () => {
    const { metric } = useMetricValue({ metricKey: 'capa.raised' })
    lastHandle().data.value = { metricValue: { nodes: [KPI_NODE] } }
    expect(metric.value.suppressed).toBeUndefined()
    expect(Object.keys(metric.value)).not.toContain('suppressed')
  })

  it('a null KPI value renders as NO DATA, never as withheld', () => {
    const { metric } = useMetricValue({ metricKey: 'capa.raised' })
    lastHandle().data.value = {
      metricValue: { nodes: [{ ...KPI_NODE, unit: 'count', value: null }] },
    }
    expect(metric.value.value).toBeNull()
    // Suppression is dimensioned; a KPI cannot claim it.
    expect(
      formatMetricValue(metric.value.value, metric.value.unit, {
        suppressed: !!metric.value.suppressed,
      }),
    ).toBe('—')
  })
})

/* ---------------------------------------------------------- metric_series */

describe('useMetricSeries', () => {
  const SERIES_NODES = [
    {
      bucket: '2026-07-01',
      dimensionValue: 'site-a',
      value: '4',
      numerator: '4',
      denominator: '10',
      suppressed: false,
    },
    {
      bucket: '2026-08-01',
      dimensionValue: 'site-b',
      value: null,
      numerator: null,
      denominator: null,
      suppressed: true,
    },
    {
      bucket: '2026-09-01',
      dimensionValue: 'site-c',
      value: null,
      numerator: null,
      denominator: null,
      suppressed: false,
    },
  ]

  it('coerces every numeric field and leaves the rest alone', () => {
    const { points } = useMetricSeries({ metricKey: 'capa.raised' })
    lastHandle().data.value = { metricSeries: { nodes: SERIES_NODES } }

    expect(typeof points.value[0].value).toBe('number')
    expect(typeof points.value[0].numerator).toBe('number')
    expect(typeof points.value[0].denominator).toBe('number')
    expect(points.value[0].bucket).toBe('2026-07-01')
    expect(points.value[0].dimensionValue).toBe('site-a')
  })

  it('a WITHHELD point keeps a null value AND its suppressed flag — never zero', () => {
    const { points } = useMetricSeries({ metricKey: 'capa.raised' })
    lastHandle().data.value = { metricSeries: { nodes: SERIES_NODES } }

    const withheld = points.value[1]
    expect(withheld.suppressed).toBe(true)
    expect(withheld.value).toBeNull()
    expect(withheld.value).not.toBe(0)
    expect(formatMetricValue(withheld.value, 'count', { suppressed: withheld.suppressed })).toBe(
      'Withheld',
    )
  })

  it('a plain null point is distinguishable from a withheld one', () => {
    const { points } = useMetricSeries({ metricKey: 'capa.raised' })
    lastHandle().data.value = { metricSeries: { nodes: SERIES_NODES } }

    const noData = points.value[2]
    expect(noData.value).toBeNull()
    expect(noData.suppressed).toBe(false)
    expect(formatMetricValue(noData.value, 'count', { suppressed: noData.suppressed })).toBe('—')
  })

  it('DOES ask for suppressed — it is a dimensioned concept and this path is dimensioned', () => {
    useMetricSeries({ metricKey: 'capa.raised' })
    expect(lastHandle().query).toMatch(/\bsuppressed\b/)
  })

  it('applies the small-cell threshold and the series cap', () => {
    useMetricSeries({ metricKey: 'capa.raised' })
    const vars = varsOf(lastHandle())
    expect(vars.pMinCell).toBe(5)
    expect(vars.first).toBe(600)

    useMetricSeries({ metricKey: 'capa.raised', minCell: 10, dimension: 'site' })
    expect(varsOf(lastHandle())).toMatchObject({ pMinCell: 10, pDimension: 'site' })
  })

  it('is an empty array before the first response', () => {
    const { points } = useMetricSeries({ metricKey: 'capa.raised' })
    expect(points.value).toEqual([])
  })
})

/* ------------------------------------------------------- metric_breakdown */

describe('useMetricBreakdown — share_of_total is ALREADY a percentage', () => {
  const ROW = {
    dimensionKey: 'site',
    dimensionValue: 'site-a',
    label: 'London',
    value: '42',
    numerator: '42',
    denominator: '91',
    shareOfTotal: '46.1538461538461538',
    rank: 1,
    suppressed: false,
    isResidual: false,
    drillRoute: '/capas',
    drillFilters: { siteId: 'site-a', statusId: 'OPEN' },
  }

  it('coerces the share to a NUMBER without scaling it', () => {
    const { rows } = useMetricBreakdown({ metricKey: 'capa.raised', dimension: 'site' })
    lastHandle().data.value = { metricBreakdown: { nodes: [ROW] } }

    const share = rows.value[0].shareOfTotal
    expect(typeof share).toBe('number')
    expect(share).toBeCloseTo(46.1538461, 6)
    expect(share).not.toBeCloseTo(4615.3846153, 6) // no ×100
    expect(share).not.toBeCloseTo(0.4615384, 6) // and no ÷100 either
  })

  it('a full-contribution segment is 100, not 10000 and not 1', () => {
    const { rows } = useMetricBreakdown({ metricKey: 'capa.raised', dimension: 'site' })
    lastHandle().data.value = {
      metricBreakdown: { nodes: [{ ...ROW, shareOfTotal: '100.0000000000000000' }] },
    }
    expect(rows.value[0].shareOfTotal).toBe(100)
  })

  it('a sub-one-percent segment stays sub-one-percent', () => {
    const { rows } = useMetricBreakdown({ metricKey: 'capa.raised', dimension: 'site' })
    lastHandle().data.value = {
      metricBreakdown: { nodes: [{ ...ROW, shareOfTotal: '0.5000000000000000' }] },
    }
    expect(rows.value[0].shareOfTotal).toBe(0.5) // half a percent — not 50%
  })

  it('the shares of a full breakdown sum to about 100, not about 1', () => {
    const { rows } = useMetricBreakdown({ metricKey: 'capa.raised', dimension: 'site' })
    lastHandle().data.value = {
      metricBreakdown: {
        nodes: [
          { ...ROW, shareOfTotal: '50.0000000000000000' },
          { ...ROW, shareOfTotal: '30.0000000000000000' },
          { ...ROW, shareOfTotal: '20.0000000000000000' },
        ],
      },
    }
    const total = rows.value.reduce((sum, r) => sum + r.shareOfTotal, 0)
    expect(total).toBeCloseTo(100, 6)
  })

  it('coerces the other numerics too, and leaves rank/labels/filters alone', () => {
    const { rows } = useMetricBreakdown({ metricKey: 'capa.raised', dimension: 'site' })
    lastHandle().data.value = { metricBreakdown: { nodes: [ROW] } }

    const row = rows.value[0]
    for (const field of ['value', 'numerator', 'denominator', 'shareOfTotal']) {
      expect(typeof row[field]).toBe('number')
    }
    expect(row.rank).toBe(1)
    expect(row.label).toBe('London')
    expect(row.drillFilters).toEqual({ siteId: 'site-a', statusId: 'OPEN' })
  })

  it('applies the documented defaults', () => {
    useMetricBreakdown({ metricKey: 'capa.raised' })
    expect(varsOf(lastHandle())).toEqual({
      pMetricKey: 'capa.raised',
      pDimension: null,
      pPeriodStart: null,
      pPeriodEnd: null,
      pLimit: 10,
      pMinCell: 5,
      pRankBy: 'contribution',
    })
  })
})

describe('useMetricBreakdown — the residual bucket is a summary, not a segment', () => {
  const RESIDUAL = {
    dimensionKey: 'site',
    dimensionValue: null,
    label: 'Other (3, 1 below threshold)',
    value: '9',
    numerator: '9',
    denominator: '91',
    shareOfTotal: '9.8901098901098901',
    rank: 99,
    suppressed: false,
    isResidual: true,
    drillRoute: null,
    drillFilters: null,
  }

  it('survives coercion with its residual markers intact', () => {
    const { rows } = useMetricBreakdown({ metricKey: 'capa.raised', dimension: 'site' })
    lastHandle().data.value = { metricBreakdown: { nodes: [RESIDUAL] } }

    const row = rows.value[0]
    expect(row.isResidual).toBe(true)
    expect(row.dimensionValue).toBeNull()
    expect(row.drillRoute).toBeNull()
    expect(typeof row.value).toBe('number') // still a number, still summable
  })

  it('is refused by isDrillable and drillLocation', () => {
    const { rows } = useMetricBreakdown({ metricKey: 'capa.raised', dimension: 'site' })
    lastHandle().data.value = { metricBreakdown: { nodes: [RESIDUAL] } }

    expect(isDrillable(rows.value[0])).toBe(false)
    expect(drillLocation(rows.value[0])).toBeNull()
  })

  it('a withheld breakdown row keeps its null value and suppressed flag', () => {
    const { rows } = useMetricBreakdown({ metricKey: 'capa.raised', dimension: 'owner' })
    lastHandle().data.value = {
      metricBreakdown: {
        nodes: [
          {
            ...RESIDUAL,
            isResidual: false,
            dimensionValue: 'user-7',
            label: 'A. Person',
            value: null,
            numerator: null,
            denominator: null,
            shareOfTotal: null,
            suppressed: true,
          },
        ],
      },
    }
    const row = rows.value[0]
    expect(row.suppressed).toBe(true)
    expect(row.value).toBeNull()
    expect(formatMetricValue(row.value, 'count', { suppressed: row.suppressed })).toBe('Withheld')
    expect(isDrillable(row)).toBe(false) // no drill target survived suppression
  })

  it('an ordinary row IS drillable, with the filters that reproduce its number', () => {
    const { rows } = useMetricBreakdown({ metricKey: 'capa.raised', dimension: 'site' })
    lastHandle().data.value = {
      metricBreakdown: {
        nodes: [
          {
            ...RESIDUAL,
            isResidual: false,
            dimensionValue: 'site-a',
            drillRoute: '/capas',
            drillFilters: { siteId: 'site-a' },
          },
        ],
      },
    }
    expect(isDrillable(rows.value[0])).toBe(true)
    expect(drillLocation(rows.value[0])).toEqual({
      path: '/capas',
      query: { siteId: 'site-a' },
    })
  })
})
