import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailAnchorNav from './DetailAnchorNav.vue'

const sections = [{ id: 'details', label: 'Details' }, { id: 'workflow', label: 'Workflow' }]

describe('DetailAnchorNav', () => {
  it('renders an anchor link per section with the right href', () => {
    const w = mount(DetailAnchorNav, { props: { sections } })
    const links = w.findAll('a')
    expect(links).toHaveLength(2)
    expect(links[0].attributes('href')).toBe('#section-details')
    expect(links[1].attributes('href')).toBe('#section-workflow')
    expect(w.text()).toContain('Details')
    expect(w.text()).toContain('Workflow')
  })
  it('marks the active section with aria-current', () => {
    const w = mount(DetailAnchorNav, { props: { sections, activeId: 'workflow' } })
    const active = w.findAll('a').find((a) => a.attributes('href') === '#section-workflow')
    expect(active.attributes('aria-current')).toBe('true')
  })
  it('exposes a Sections nav landmark', () => {
    const w = mount(DetailAnchorNav, { props: { sections } })
    expect(w.find('nav[aria-label="Sections"]').exists()).toBe(true)
  })
})
