import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import '@/extensions/datetime.js' // installs DateTime.prototype.formatDate
import AnalyticsMetaLine from './AnalyticsMetaLine.vue'

/**
 * The provenance line carries the three things that stop a number reading as a
 * bug (scope, tier, freshness) and — since the calculation note landed — the
 * fourth: HOW the number was worked out.
 *
 * The contract this file pins down is the null one. `calculation_note` is
 * nullable on `analytics_metrics`, so most metrics will have no note for a
 * while. A metric without one must render NO affordance at all: an info icon
 * that opens an empty popover is worse than no icon, because it promises an
 * explanation the system does not have.
 */

// The badges resolve enum labels through their own maps; this file is about the
// line itself, so keep them out of the way.
const BadgeStub = { name: 'BadgeStub', props: ['scopeId', 'tierId'], template: '<span />' }

// BasePopover is teleported and transition-wrapped by HeadlessUI; render both
// of its slots inline so the assertions are about THIS component's markup.
const PopoverStub = {
  name: 'BasePopover',
  template: '<div class="popover"><slot name="button" /><slot name="content" /></div>',
}

/** Far enough back that Luxon's relative phrasing is stable ("5 minutes ago"). */
function fiveMinutesAgo() {
  return new Date(Date.now() - 5 * 60 * 1000).toISOString()
}

function mountLine(props = {}, { realPopover = false } = {}) {
  return mount(AnalyticsMetaLine, {
    props,
    global: {
      stubs: {
        AnalyticsScopeBadgeById: BadgeStub,
        AnalyticsTierBadgeById: BadgeStub,
        ...(realPopover ? {} : { BasePopover: PopoverStub }),
      },
    },
  })
}

const NOTE =
  'Counts CAPAs whose due date fell inside the period and that were still open on that date. ' +
  'Records closed before their due date are excluded. Reopened CAPAs count once, on their latest due date.'

describe('AnalyticsMetaLine — the calculation note', () => {
  it('offers the explanation when the metric has one', () => {
    const w = mountLine({ calculationNote: NOTE })
    const trigger = w.get('button[aria-label="How this is calculated"]')
    expect(trigger.text()).toContain("How it's calculated")
    expect(w.text()).toContain('Counts CAPAs whose due date fell inside the period')
  })

  it('renders NO affordance when the metric has no note', () => {
    const w = mountLine({ calculationNote: null })
    expect(w.find('button[aria-label="How this is calculated"]').exists()).toBe(false)
    expect(w.find('.popover').exists()).toBe(false)
  })

  it('treats an empty or whitespace-only note as no note', () => {
    for (const note of ['', '   \n  ']) {
      const w = mountLine({ calculationNote: note })
      expect(w.find('button[aria-label="How this is calculated"]').exists()).toBe(false)
    }
  })

  it('does not disturb the rest of the line when absent', () => {
    const w = mountLine({ computedAt: fiveMinutesAgo() })
    expect(w.text()).toContain('5 minutes ago')
    expect(w.find('button').exists()).toBe(false)
  })

  it('carries the note alongside scope, tier and freshness, not instead of them', () => {
    const w = mountLine({
      scope: 'site',
      tier: 'rollup',
      computedAt: fiveMinutesAgo(),
      calculationNote: NOTE,
    })
    expect(w.findAllComponents(BadgeStub)).toHaveLength(2)
    expect(w.text()).toContain('5 minutes ago')
    expect(w.find('button[aria-label="How this is calculated"]').exists()).toBe(true)
  })

  it('the real popover trigger is a keyboard-reachable button', () => {
    const w = mountLine({ calculationNote: NOTE }, { realPopover: true })
    const trigger = w.get('button[aria-label="How this is calculated"]')
    // A real <button> is in the tab order and fires on Enter/Space natively —
    // no tabindex or key handling of our own to get wrong.
    expect(trigger.element.tagName).toBe('BUTTON')
    expect(trigger.attributes('type')).toBe('button')
    w.unmount()
  })
})
