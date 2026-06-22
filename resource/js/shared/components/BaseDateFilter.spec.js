import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseDateFilter from './BaseDateFilter.vue'

const mounted = []
function mountFilter(modelValue = null) {
  const w = mount(BaseDateFilter, { attachTo: document.body, props: { modelValue } })
  mounted.push(w)
  return w
}
afterEach(() => {
  while (mounted.length) mounted.pop().unmount()
  document.body.innerHTML = ''
})

describe('BaseDateFilter', () => {
  it('renders an operator selector with all operators', () => {
    const w = mountFilter()
    const opts = [...w.element.querySelectorAll('select[data-op] option')].map((o) => o.value)
    expect(opts).toContain('before')
    expect(opts).toContain('between')
    expect(opts).toContain('relative')
  })

  it('emits a token when the operator changes to before', async () => {
    const w = mountFilter({ operator: 'relative', relative: { dir: 'past', unit: 'day', count: 7 } })
    const sel = w.get('select[data-op]')
    await sel.setValue('before')
    expect(w.emitted('update:modelValue').at(-1)[0].operator).toBe('before')
  })

  it('shows two value controls for between', async () => {
    const w = mountFilter({ operator: 'between', value: null, value2: null })
    await nextTick()
    expect(w.findAll('[data-value-field]').length).toBe(2)
  })

  it('shows count + unit controls for relative', async () => {
    const w = mountFilter({ operator: 'relative', relative: { dir: 'past', unit: 'day', count: 7 } })
    await nextTick()
    expect(w.find('[data-rel-count]').exists()).toBe(true)
    expect(w.find('[data-rel-unit]').exists()).toBe(true)
  })

  it('shows no value control for empty', async () => {
    const w = mountFilter({ operator: 'empty' })
    await nextTick()
    expect(w.findAll('[data-value-field]').length).toBe(0)
  })
})
