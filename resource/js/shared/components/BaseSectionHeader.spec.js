import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import BaseSectionHeader from './BaseSectionHeader.vue'

const StubIcon = { name: 'StubIcon', render: () => h('svg', { 'data-icon': 'true' }) }

describe('BaseSectionHeader', () => {
  it('renders the title in a heading element', () => {
    const w = mount(BaseSectionHeader, { props: { title: 'Basic information' } })
    const heading = w.find('h3')
    expect(heading.exists()).toBe(true)
    expect(heading.text()).toContain('Basic information')
  })

  it('honours the semantic level for the rendered tag', () => {
    const w = mount(BaseSectionHeader, { props: { title: 'X', level: 2 } })
    expect(w.find('h2').exists()).toBe(true)
  })

  it('renders the icon when provided', () => {
    const w = mount(BaseSectionHeader, { props: { title: 'X', icon: StubIcon } })
    expect(w.find('[data-icon]').exists()).toBe(true)
  })

  it('renders a subtitle when provided', () => {
    const w = mount(BaseSectionHeader, { props: { title: 'X', subtitle: '3 items' } })
    expect(w.text()).toContain('3 items')
  })

  it('renders the actions slot', () => {
    const w = mount(BaseSectionHeader, {
      props: { title: 'X' },
      slots: { actions: '<button data-test="action">Edit</button>' },
    })
    expect(w.find('[data-test="action"]').exists()).toBe(true)
  })

  it('omits the actions container when no actions slot is given', () => {
    const w = mount(BaseSectionHeader, { props: { title: 'X' } })
    // only the icon/title column should be present (no second flex child)
    expect(w.findAll('button')).toHaveLength(0)
  })
})
