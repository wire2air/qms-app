import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, h, nextTick } from 'vue'
import { useRouteMeta } from './useRouteMeta.js'

const registry = {
  '/capas': { title: 'CAPAs', icon: { name: 'IconShield' } },
  '/capas/:id': {
    title: (_p, ctx) => ctx.recordTitle ?? 'CAPA',
    parent: '/capas',
  },
}

function harness(initialPath) {
  const route = reactive({ path: initialPath })
  let api
  const Comp = {
    setup() {
      api = useRouteMeta({ registry, route })
      return () => h('div')
    },
  }
  mount(Comp)
  return { api, route }
}

describe('useRouteMeta', () => {
  it('resolves title, icon, and breadcrumbs for the current route', () => {
    const { api } = harness('/capas')
    expect(api.title.value).toBe('CAPAs')
    expect(api.icon.value).toEqual({ name: 'IconShield' })
    expect(api.breadcrumbs.value).toEqual([{ label: 'CAPAs' }])
  })

  it('reacts to route changes', async () => {
    const { api, route } = harness('/capas')
    route.path = '/capas/42'
    await nextTick()
    expect(api.title.value).toBe('CAPA') // function-title fallback
    expect(api.breadcrumbs.value).toEqual([{ label: 'CAPAs', to: '/capas' }, { label: 'CAPA' }])
  })

  it('feeds a record title into the function-title + trailing crumb', async () => {
    const { api } = harness('/capas/42')
    api.setRecordTitle('CAPA-2026-014')
    await nextTick()
    expect(api.title.value).toBe('CAPA-2026-014')
    expect(api.breadcrumbs.value.at(-1)).toEqual({ label: 'CAPA-2026-014' })
  })

  it('keeps document.title in sync, with the app-name suffix', async () => {
    const { route } = harness('/capas')
    expect(document.title).toBe('CAPAs · Qability')
    route.path = '/unknown'
    await nextTick()
    expect(document.title).toBe('Qability') // no meta → bare app name
  })
})
