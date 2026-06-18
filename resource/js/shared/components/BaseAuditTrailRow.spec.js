import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseAuditTrailRow from './BaseAuditTrailRow.vue'

// Stand-in for a luxon DateTime (the axios transformer hands components these).
const fakeDate = (out) => ({ formatDate: () => out })

describe('BaseAuditTrailRow', () => {
  it('renders the prefix, the actor slot, and the formatted date', () => {
    const w = mount(BaseAuditTrailRow, {
      props: { date: fakeDate('Jun 18, 2026, 2:00 PM') },
      slots: { default: '<span data-test="user">Jane Doe</span>' },
    })
    expect(w.text()).toContain('by')
    expect(w.find('[data-test="user"]').exists()).toBe(true)
    expect(w.text()).toContain('Jun 18, 2026, 2:00 PM')
  })

  it('formats the date via dt.formatDate with the given format', () => {
    let received
    const date = { formatDate: (f) => ((received = f), 'X') }
    mount(BaseAuditTrailRow, { props: { date, dateFormat: 'date' } })
    expect(received).toBe('date')
  })

  it('falls back to the actor prop when no slot is given', () => {
    const w = mount(BaseAuditTrailRow, { props: { actor: 'System' } })
    expect(w.text()).toContain('System')
  })

  it('omits the date (and separator) when no date is provided', () => {
    const w = mount(BaseAuditTrailRow, {
      props: {},
      slots: { default: '<span>Jane</span>' },
    })
    expect(w.text()).not.toContain('·')
  })

  it('shows the separator only when both actor and date are present', () => {
    const w = mount(BaseAuditTrailRow, {
      props: { date: fakeDate('today') },
      slots: { default: '<span>Jane</span>' },
    })
    expect(w.text()).toContain('·')
  })

  it('supports a custom prefix and separator', () => {
    const w = mount(BaseAuditTrailRow, {
      props: { prefix: 'Voided by', separator: '—', date: fakeDate('today'), actor: 'Bob' },
    })
    expect(w.text()).toContain('Voided by')
    expect(w.text()).toContain('—')
    expect(w.text()).not.toContain('·')
  })

  it('renders nothing for the date when the value lacks formatDate', () => {
    const w = mount(BaseAuditTrailRow, {
      props: { date: 'not-a-datetime' },
      slots: { default: '<span>Jane</span>' },
    })
    expect(w.text()).not.toContain('not-a-datetime')
    expect(w.text()).not.toContain('·')
  })
})
