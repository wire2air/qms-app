import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CompanyCardSaveStatus from './CompanyCardSaveStatus.vue'

// The status slot every company-settings card puts in its header. The cards
// autosave over GraphQL, where RLS decides — so the usual failure is a refusal
// the admin cannot diagnose unless the reason is actually shown.

const RLS_REFUSAL =
  "No values were updated in collection 'companies' because no values you can update were found matching these criteria."

describe('CompanyCardSaveStatus', () => {
  it('renders nothing while idle', () => {
    expect(mount(CompanyCardSaveStatus).text()).toBe('')
  })

  it('shows "Saving…" while a save is in flight, even with a previous error set', () => {
    const w = mount(CompanyCardSaveStatus, { props: { saving: true, error: 'old' } })
    expect(w.text()).toBe('Saving…')
  })

  it('shows the failure reason as visible text, not only as a tooltip', () => {
    const w = mount(CompanyCardSaveStatus, { props: { error: 'Network request failed' } })
    expect(w.text()).toContain('Save failed')
    expect(w.text()).toContain('Network request failed')
    expect(w.find('[title]').attributes('title')).toBe('Network request failed')
  })

  it('translates the RLS zero-row refusal into a permission message, keeping the raw text in the tooltip', () => {
    const w = mount(CompanyCardSaveStatus, { props: { error: RLS_REFUSAL } })
    expect(w.text()).toContain("you don't have permission to change these settings")
    expect(w.text()).not.toContain('No values were updated')
    expect(w.find('[title]').attributes('title')).toBe(RLS_REFUSAL)
  })

  it('is announced to assistive technology (role="status")', () => {
    const w = mount(CompanyCardSaveStatus, { props: { error: 'x' } })
    expect(w.attributes('role')).toBe('status')
  })
})
