import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// Docs/modules/dashboard 2026-09-07 addendum, D-1: the widget used to deny-list
// only CLOSED, so a CANCELLED nonconformance (a status NC gained on 2026-08-23,
// 20260823100000-unified-record-statuses.js) counted as "open" here while
// NonconformancesHome's own allow-list (OPEN_STATUSES) correctly excluded it.
// Same shape as the fix already shipped for CAPA in this file's siblings.
let ncRows = []
vi.mock('@models/index', () => ({
  db: { Nonconformance: { where: () => ({ exec: async () => ncRows }) } },
}))

const RouterLinkStub = {
  name: 'RouterLink',
  props: ['to'],
  template: '<a><slot /></a>',
}

const DashboardOpenNcs = (await import('./DashboardOpenNcs.vue')).default

function makeNc(id, statusId, overrides = {}) {
  return {
    id,
    statusId,
    title: `NC ${id}`,
    ncNumber: `NC-${id}`,
    createdAt: { toMillis: () => Number(id) },
    ...overrides,
  }
}

function mountWidget() {
  return mount(DashboardOpenNcs, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('DashboardOpenNcs — CANCELLED is not open (D-1)', () => {
  beforeEach(() => {
    ncRows = []
  })

  it('excludes CLOSED and CANCELLED, includes DRAFT and OPEN', async () => {
    ncRows = [
      makeNc('1', 'DRAFT'),
      makeNc('2', 'OPEN'),
      makeNc('3', 'CLOSED'),
      makeNc('4', 'CANCELLED'),
    ]
    const w = mountWidget()
    await flushPromises()

    expect(w.text()).toContain('NC-1')
    expect(w.text()).toContain('NC-2')
    expect(w.text()).not.toContain('NC-3')
    expect(w.text()).not.toContain('NC-4')
  })

  it('the count pill does not include a CANCELLED nonconformance', async () => {
    ncRows = [makeNc('1', 'OPEN'), makeNc('2', 'CANCELLED')]
    const w = mountWidget()
    await flushPromises()

    // DashboardWidgetCard renders `count` in a pill; only the one OPEN row
    // should be reflected.
    expect(w.text()).toContain('1')
    expect(w.text()).not.toContain('2')
  })

  it('shows the empty state when every NC is CLOSED or CANCELLED', async () => {
    ncRows = [makeNc('1', 'CLOSED'), makeNc('2', 'CANCELLED')]
    const w = mountWidget()
    await flushPromises()

    expect(w.text()).toContain('No open nonconformances')
  })
})
