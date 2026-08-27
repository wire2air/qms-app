import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AnalyticsBreakdownList from './AnalyticsBreakdownList.vue'

/**
 * The breakdown list is the first hop of Insight → Evidence → Record → Action,
 * so it is the surface where three analytics contracts become visible pixels:
 *
 *  - `share_of_total` is ALREADY a percentage (0–100), not a fraction. Scaling
 *    it again ("×100") sends every bar to 100% and makes a 46% segment look
 *    total. This is the latent bug this file exists to prevent regressing.
 *  - A RESIDUAL row summarises segments deliberately not shown individually;
 *    it must never be a link.
 *  - A WITHHELD row must render "Withheld" and NO bar — a zero-width bar reads
 *    as zero, which is the one thing suppression must never look like.
 */

const RouterLinkStub = {
  name: 'RouterLink',
  props: ['to'],
  template: '<a class="drill" :href="to?.path || \'#\'"><slot /></a>',
}

function mountList(rows, unit = 'count') {
  return mount(AnalyticsBreakdownList, {
    props: { rows, unit },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

/** The inline width the component computed for a row's contribution bar. */
function barWidths(wrapper) {
  return wrapper
    .findAll('li')
    .map((li) => li.find('div[style*="width"]'))
    .map((bar) => (bar.exists() ? bar.attributes('style') : null))
}

const ROW = {
  dimensionKey: 'site',
  dimensionValue: 'site-a',
  label: 'London',
  value: 42,
  numerator: 42,
  denominator: 91,
  shareOfTotal: 46.15384615384615,
  rank: 1,
  suppressed: false,
  isResidual: false,
  drillRoute: '/capas',
  drillFilters: { siteId: 'site-a' },
}

describe('AnalyticsBreakdownList — share_of_total is a percentage, not a fraction', () => {
  it('renders the share verbatim as the bar width — no ×100', () => {
    const w = mountList([ROW])
    expect(barWidths(w)[0]).toContain('width: 46.15384615384615%')
  })

  it('a 0.5 share is half a percent of the bar, not half the bar', () => {
    const w = mountList([{ ...ROW, shareOfTotal: 0.5 }])
    expect(barWidths(w)[0]).toContain('width: 0.5%')
  })

  it('a 100 share fills the bar exactly once', () => {
    const w = mountList([{ ...ROW, shareOfTotal: 100 }])
    expect(barWidths(w)[0]).toContain('width: 100%')
  })

  it('clamps a rounding artefact rather than overflowing the track', () => {
    const over = mountList([{ ...ROW, shareOfTotal: 100.0000001 }])
    expect(barWidths(over)[0]).toContain('width: 100%')
    const under = mountList([{ ...ROW, shareOfTotal: -0.3 }])
    expect(barWidths(under)[0]).toContain('width: 0%')
  })

  it('treats a missing or unusable share as 0% rather than NaN%', () => {
    for (const share of [null, undefined, 'nonsense']) {
      const w = mountList([{ ...ROW, shareOfTotal: share }])
      expect(barWidths(w)[0]).toContain('width: 0%')
    }
  })
})

describe('AnalyticsBreakdownList — drillability', () => {
  it('an ordinary row links to the records that produced its number', () => {
    const w = mountList([ROW])
    const link = w.findComponent(RouterLinkStub)
    expect(link.exists()).toBe(true)
    expect(link.props('to')).toEqual({ path: '/capas', query: { siteId: 'site-a' } })
    expect(w.get('a.drill').attributes('aria-label')).toContain('London')
  })

  it('the RESIDUAL bucket is rendered but never linked', () => {
    const residual = {
      ...ROW,
      dimensionValue: null,
      label: 'Other (3, 1 below threshold)',
      isResidual: true,
      drillRoute: null,
      drillFilters: null,
      shareOfTotal: 9.89,
    }
    const w = mountList([residual])
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false)
    expect(w.text()).toContain('Other (3, 1 below threshold)')
    expect(barWidths(w)[0]).toContain('width: 9.89%') // it still shows its size
  })

  it('mixes drillable and non-drillable rows in one list', () => {
    const w = mountList([
      ROW,
      { ...ROW, dimensionValue: 'site-b', label: 'Leeds' },
      { ...ROW, isResidual: true, label: 'Other', drillRoute: null },
    ])
    expect(w.findAll('li')).toHaveLength(3)
    expect(w.findAllComponents(RouterLinkStub)).toHaveLength(2)
  })
})

describe('AnalyticsBreakdownList — a withheld row is not a zero row', () => {
  const withheld = {
    ...ROW,
    dimensionValue: 'user-7',
    label: 'A. Person',
    value: null,
    numerator: null,
    denominator: null,
    shareOfTotal: null,
    suppressed: true,
    drillRoute: null,
    drillFilters: null,
  }

  it('reads "Withheld" — never 0 and never blank', () => {
    const w = mountList([withheld])
    expect(w.text()).toContain('Withheld')
    expect(w.text()).not.toContain('0')
  })

  it('draws NO bar at all, because a zero-width bar reads as zero', () => {
    const w = mountList([withheld])
    expect(barWidths(w)[0]).toBeNull()
  })

  it('is never a link', () => {
    const w = mountList([withheld])
    expect(w.findComponent(RouterLinkStub).exists()).toBe(false)
  })

  it('a plain-null row is shown as no data, distinct from withheld', () => {
    const w = mountList([{ ...withheld, suppressed: false }])
    expect(w.text()).not.toContain('Withheld')
    expect(w.text()).toContain('—')
  })
})

describe('AnalyticsBreakdownList — units', () => {
  it('formats each row with the metric unit it was given', () => {
    // coerced upstream by useAnalytics from the BigFloat string '90.1098901098901099'
    const w = mountList([{ ...ROW, value: Number('90.1098901098901099') }], 'percent')
    expect(w.text()).toContain('90.1%')
  })

  it('renders nothing at all for an empty breakdown', () => {
    const w = mountList([])
    expect(w.findAll('li')).toHaveLength(0)
  })
})
