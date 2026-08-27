import { describe, it, expect } from 'vitest'
import {
  DEFAULT_VIZ,
  vizOptionsFor,
  dimensionOptionsFor,
  isDimensionAllowed,
  clampQuestion,
} from '@/utils/analyticsViz.js'

/** A metric_catalog row, in the shape the picker actually receives. */
function metric(overrides = {}) {
  return {
    metricKey: 'ncr.raised',
    name: 'NCs Raised',
    unit: 'count',
    dimensions: [{ key: 'severity' }, { key: 'source' }],
    dimensionCapacity: 3,
    ...overrides,
  }
}

/** A full question, as both the widget dialog and the Explorer hold it. */
function question(overrides = {}) {
  return {
    metricKey: 'ncr.raised',
    viz: 'kpi',
    dimension: null,
    periodToken: 'last_12_months',
    compare: 'previous_period',
    title: 'My tile',
    filters: { rankBy: 'contribution', limit: 10 },
    ...overrides,
  }
}

describe('clampQuestion', () => {
  /**
   * THE REGRESSION. clampQuestion once returned only `{ viz, dimension }`, and
   * both callers read its result as the question itself — so `normalised.metricKey`
   * was permanently `undefined`. That gated the widget dialog's submit button and
   * the Explorer's "Save as widget" off forever, hid the Explorer's preview tile
   * behind its own `v-if`, and would have persisted a widget with a null metric,
   * no title, no comparison and no filters had the gate ever opened.
   *
   * The two repaired keys are the SMALL part of the return value. Everything the
   * caller put in has to come back out.
   */
  it('returns the whole question, not just the keys it repairs', () => {
    const q = question()
    const out = clampQuestion(metric(), q)

    expect(out).toMatchObject({
      metricKey: 'ncr.raised',
      periodToken: 'last_12_months',
      compare: 'previous_period',
      title: 'My tile',
      filters: { rankBy: 'contribution', limit: 10 },
    })
    // Nothing the caller passed may be dropped.
    for (const key of Object.keys(q)) expect(out).toHaveProperty(key)
  })

  it('leaves a legal viz/dimension pair alone', () => {
    const out = clampQuestion(metric(), question({ viz: 'line', dimension: 'severity' }))
    expect(out.viz).toBe('line')
    expect(out.dimension).toBe('severity')
  })

  it('degrades a viz this build no longer offers to the first one it does', () => {
    const out = clampQuestion(metric(), question({ viz: 'histogram' }))
    expect(out.viz).toBe(vizOptionsFor(metric())[0].id)
  })

  it('drops a dimension the metric has since stopped declaring', () => {
    // A widget saved when `source` existed, read back after it was removed.
    const narrowed = metric({ dimensions: [{ key: 'severity' }] })
    const out = clampQuestion(narrowed, question({ viz: 'line', dimension: 'source' }))
    expect(out.dimension).toBeNull()
  })

  it('fills a required dimension rather than leaving one unrenderable', () => {
    const out = clampQuestion(metric(), question({ viz: 'stacked_bar', dimension: null }))
    expect(out.viz).toBe('stacked_bar')
    expect(out.dimension).toBe('severity')
  })

  it('falls back to the default viz when there is no metric yet', () => {
    const out = clampQuestion(null, question({ metricKey: null, viz: 'line' }))
    expect(out.viz).toBe(DEFAULT_VIZ)
    expect(out.dimension).toBeNull()
    expect(out.metricKey).toBeNull()
  })

  /**
   * The metric-switch path (AnalyticsQuestionBuilder.onMetricChange). Because the
   * clamp now returns the whole question, the INCOMING metric has to be in the
   * draft — spreading the clamp over a separate `metricKey` would put the
   * outgoing one back and the picker would never change.
   */
  it('keeps the incoming metric when clamping a draft mid-switch', () => {
    const next = metric({ metricKey: 'capa.closed', unit: 'days', dimensions: [] })
    const out = clampQuestion(next, question({ metricKey: 'capa.closed', viz: 'donut' }))
    expect(out.metricKey).toBe('capa.closed')
    // 'donut' is counts-only, so a days-unit metric must not keep it.
    expect(out.viz).not.toBe('donut')
  })

  it('tolerates being called with no draft at all', () => {
    expect(clampQuestion(metric())).toMatchObject({ viz: expect.any(String), dimension: null })
  })
})

describe('the picker contracts clampQuestion leans on', () => {
  it('offers scope dimensions on a breakdown viz and not on a series one', () => {
    const breakdown = dimensionOptionsFor(metric(), 'bar').map((d) => d.value)
    const series = dimensionOptionsFor(metric(), 'line').map((d) => d.value)
    expect(breakdown).toEqual(expect.arrayContaining(['site', 'department', 'owner']))
    expect(series).not.toEqual(expect.arrayContaining(['site']))
    expect(isDimensionAllowed(metric(), 'bar', 'site')).toBe(true)
    expect(isDimensionAllowed(metric(), 'line', 'site')).toBe(false)
  })

  it('withholds additive vizzes from a non-count metric', () => {
    const ids = vizOptionsFor(metric({ unit: 'percent' })).map((r) => r.id)
    expect(ids).not.toEqual(expect.arrayContaining(['stacked_bar', 'donut', 'funnel']))
  })

  it('offers no viz at all without a metric', () => {
    expect(vizOptionsFor(null)).toEqual([])
  })
})
