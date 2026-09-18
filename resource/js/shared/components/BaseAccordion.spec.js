import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseAccordion from './BaseAccordion.vue'

const ITEMS = [
  { value: 'a', title: 'Overview' },
  { value: 'b', title: 'History' },
  { value: 'c', title: 'Locked', disabled: true },
]

describe('BaseAccordion (WAI-ARIA)', () => {
  it('renders a header button per item with aria-controls + collapsed state', () => {
    const w = mount(BaseAccordion, { props: { items: ITEMS, modelValue: [] } })
    const headers = w.findAll('button[data-accordion-header]')
    expect(headers).toHaveLength(3)
    expect(headers[0].attributes('aria-expanded')).toBe('false')
    expect(headers[0].attributes('aria-controls')).toBeTruthy()
  })

  it('opening reflects aria-expanded and shows a labelled region', async () => {
    const w = mount(BaseAccordion, {
      props: { items: ITEMS, modelValue: [], 'onUpdate:modelValue': (e) => w.setProps({ modelValue: e }) },
    })
    await w.findAll('button[data-accordion-header]')[0].trigger('click')
    expect(w.props('modelValue')).toEqual(['a'])
    const header = w.findAll('button[data-accordion-header]')[0]
    expect(header.attributes('aria-expanded')).toBe('true')
    const region = w.find('[role="region"]')
    expect(region.attributes('aria-labelledby')).toBe(header.attributes('id'))
  })

  it('single-open mode closes the previous panel', async () => {
    const w = mount(BaseAccordion, {
      props: { items: ITEMS, modelValue: ['a'], 'onUpdate:modelValue': (e) => w.setProps({ modelValue: e }) },
    })
    await w.findAll('button[data-accordion-header]')[1].trigger('click')
    expect(w.props('modelValue')).toEqual(['b'])
  })

  it('multiple mode keeps panels open', async () => {
    const w = mount(BaseAccordion, {
      props: { items: ITEMS, multiple: true, modelValue: ['a'], 'onUpdate:modelValue': (e) => w.setProps({ modelValue: e }) },
    })
    await w.findAll('button[data-accordion-header]')[1].trigger('click')
    expect(w.props('modelValue')).toEqual(['a', 'b'])
  })

  it('disabled item does not toggle', async () => {
    const w = mount(BaseAccordion, {
      props: { items: ITEMS, modelValue: [], 'onUpdate:modelValue': (e) => w.setProps({ modelValue: e }) },
    })
    await w.findAll('button[data-accordion-header]')[2].trigger('click')
    expect(w.props('modelValue')).toEqual([])
  })

  it('renders panel content via a per-value slot', async () => {
    const w = mount(BaseAccordion, {
      props: { items: ITEMS, modelValue: ['a'] },
      slots: { a: '<p data-test="panel-a">Panel A body</p>' },
    })
    expect(w.find('[data-test="panel-a"]').exists()).toBe(true)
  })
})
