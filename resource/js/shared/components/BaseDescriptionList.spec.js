import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseDescriptionList from './BaseDescriptionList.vue'
import BaseDescriptionItem from './BaseDescriptionItem.vue'

describe('BaseDescriptionList', () => {
  it('renders a <dl> wrapping its items', () => {
    const w = mount(BaseDescriptionList, {
      slots: { default: '<div data-test="row">row</div>' },
    })
    expect(w.find('dl').exists()).toBe(true)
    expect(w.find('[data-test="row"]').exists()).toBe(true)
  })

  it('adds divider classes between items when divided', () => {
    const w = mount(BaseDescriptionList, { props: { divided: true } })
    expect(w.find('dl').classes().join(' ')).toContain('tw:divide-y')
  })

  it('is not divided by default', () => {
    const w = mount(BaseDescriptionList)
    expect(w.find('dl').classes().join(' ')).not.toContain('tw:divide-y')
  })

  it('provides the inline layout to child items by default', () => {
    const w = mount(BaseDescriptionList, {
      slots: { default: () => h(BaseDescriptionItem, { label: 'X', value: 'Y' }) },
    })
    // child item inherits inline → justify-between
    expect(w.html()).toContain('tw:justify-between')
  })

  it('propagates stacked layout to child items', () => {
    const w = mount(BaseDescriptionList, {
      props: { layout: 'stacked' },
      slots: { default: () => h(BaseDescriptionItem, { label: 'X', value: 'Y' }) },
    })
    expect(w.html()).not.toContain('tw:justify-between')
  })

  it('lets an item override the inherited layout via its own prop', () => {
    const w = mount(BaseDescriptionList, {
      props: { layout: 'stacked' },
      slots: { default: () => h(BaseDescriptionItem, { label: 'X', value: 'Y', layout: 'inline' }) },
    })
    expect(w.html()).toContain('tw:justify-between')
  })
})
