// useDetailLayout.spec.js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, h } from 'vue'
import { useDetailLayout } from './useDetailLayout.js'
import { resolveVariant } from './detailVariantHelpers.js'

// Mount inside a component so onMounted-based VueUse hooks (useScroll) run.
function harness(options) {
  let api
  const Comp = {
    setup() {
      api = useDetailLayout(options)
      return () => h('div')
    },
  }
  const wrapper = mount(Comp, { attachTo: document.body })
  return { api, wrapper }
}

describe('useDetailLayout', () => {
  it('derives state from flags', () => {
    const loading = ref(true)
    const { api } = harness({ loading, notFound: false, error: false, actions: [] })
    expect(api.state.value).toBe('loading')
    loading.value = false
    expect(api.state.value).toBe('ready')
  })

  it('flattens action predicates then buckets', () => {
    const actions = [
      { id: 'a', priority: 5, variant: 'primary', visible: () => true },
      { id: 'hidden', priority: 9, visible: () => false },
      { id: 'b', priority: 1, disabled: () => true },
    ]
    const { api } = harness({ loading: false, actions, maxVisibleActions: 3 })
    expect(api.actionBuckets.value.visible.map((d) => d.id)).toEqual(['a', 'b'])
    // resolved booleans are exposed for the renderer
    expect(api.actionBuckets.value.visible.find((d) => d.id === 'b').disabled).toBe(true)
  })

  it('exposes scrolled / breakpoint refs', () => {
    const { api } = harness({ loading: false, actions: [] })
    expect(typeof api.scrolled.value).toBe('boolean')
    expect(typeof api.isMobile.value).toBe('boolean')
    expect(typeof api.isTablet.value).toBe('boolean')
  })
})

describe('useDetailLayout — variant descriptor', () => {
  it('exposes the resolved variant descriptor', () => {
    const { variantDescriptor } = useDetailLayout({ variant: 'readonly' })
    expect(variantDescriptor.value).toEqual(resolveVariant('readonly'))
  })
  it('defaults to standard when no variant given', () => {
    const { variantDescriptor } = useDetailLayout({})
    expect(variantDescriptor.value.variant).toBe('standard')
  })
})

describe('useDetailLayout — nav model', () => {
  it('builds a nav model from sections + tabs', () => {
    const { navModel } = useDetailLayout({
      sections: [{ id: 'details', label: 'Details' }],
      tabs: [{ value: 'activity', label: 'Activity' }],
    })
    expect(navModel.value.items.map((i) => i.key)).toEqual(['details', 'activity'])
    expect(navModel.value.hasAnchor).toBe(true)
    expect(navModel.value.hasPanel).toBe(true)
  })
})
