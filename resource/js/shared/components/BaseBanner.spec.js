import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseBanner from './BaseBanner.vue'

describe('BaseBanner', () => {
  it('renders title and message with the tone exposed', () => {
    const w = mount(BaseBanner, { props: { tone: 'warning', title: 'Archived', message: 'Read-only.' } })
    expect(w.get('[data-test="base-banner"]').attributes('data-tone')).toBe('warning')
    expect(w.text()).toContain('Archived')
    expect(w.text()).toContain('Read-only.')
  })
  it('uses polite live region by default and assertive for danger', () => {
    const polite = mount(BaseBanner, { props: { title: 'X' } })
    expect(polite.get('[data-test="base-banner"]').attributes('aria-live')).toBe('polite')
    const danger = mount(BaseBanner, { props: { tone: 'danger', title: 'X' } })
    expect(danger.get('[data-test="base-banner"]').attributes('aria-live')).toBe('assertive')
  })
  it('shows no dismiss button unless dismissible', () => {
    const w = mount(BaseBanner, { props: { title: 'X' } })
    expect(w.find('[data-test="banner-dismiss"]').exists()).toBe(false)
  })
  it('emits dismiss when the dismiss button is clicked', async () => {
    const w = mount(BaseBanner, { props: { title: 'X', dismissible: true } })
    await w.get('[data-test="banner-dismiss"]').trigger('click')
    expect(w.emitted('dismiss')).toHaveLength(1)
  })
})
