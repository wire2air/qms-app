import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, h } from 'vue'
import BaseListPage from './BaseListPage.vue'

const StubIcon = { name: 'StubIcon', render: () => h('svg', { 'data-icon': 'true' }) }

// PageHeader (rendered inside the shell) teleports into these zones.
function mountPage(options) {
  return mount(BaseListPage, { attachTo: document.body, ...options })
}

describe('BaseListPage', () => {
  let title, actions
  beforeEach(() => {
    title = document.createElement('div')
    title.id = 'main-header-title'
    actions = document.createElement('div')
    actions.id = 'main-header-actions'
    document.body.append(title, actions)
  })
  afterEach(() => {
    title.remove()
    actions.remove()
  })

  it('teleports the title + icon into the app header', async () => {
    mountPage({ props: { title: 'Documents', icon: StubIcon } })
    await nextTick()
    await nextTick()
    expect(title.textContent).toContain('Documents')
    expect(title.querySelector('[data-icon]')).not.toBeNull()
  })

  it('renders the default slot as the content region', () => {
    const w = mountPage({ slots: { default: '<table data-test="t"></table>' } })
    expect(w.find('[data-test="t"]').exists()).toBe(true)
  })

  it('renders the #stats and #filters slots', () => {
    const w = mountPage({
      slots: {
        stats: '<div data-test="stats"></div>',
        filters: '<div data-test="filters"></div>',
        default: '<div data-test="content"></div>',
      },
    })
    expect(w.find('[data-test="stats"]').exists()).toBe(true)
    expect(w.find('[data-test="filters"]').exists()).toBe(true)
  })

  it('teleports the actions slot into the header actions zone', async () => {
    mountPage({ props: { title: 'X' }, slots: { actions: '<button>Create</button>' } })
    await nextTick()
    await nextTick()
    expect(actions.textContent).toContain('Create')
  })

  it('shows a loading region and hides the default content when loading', () => {
    const w = mountPage({
      props: { loading: true },
      slots: { default: '<div data-test="content"></div>' },
    })
    expect(w.find('[data-test="content"]').exists()).toBe(false)
  })

  it('keeps the filters visible while loading', () => {
    const w = mountPage({
      props: { loading: true },
      slots: { filters: '<div data-test="filters"></div>', default: '<div data-test="content"></div>' },
    })
    expect(w.find('[data-test="filters"]').exists()).toBe(true)
  })

  it('shows the empty state with a custom title when empty (not loading)', () => {
    const w = mountPage({
      props: { empty: true, emptyTitle: 'No documents yet' },
      slots: { default: '<div data-test="content"></div>' },
    })
    expect(w.find('[data-test="content"]').exists()).toBe(false)
    expect(w.text()).toContain('No documents yet')
  })

  it('renders content (not empty/loading) by default', () => {
    const w = mountPage({ slots: { default: '<div data-test="content"></div>' } })
    expect(w.find('[data-test="content"]').exists()).toBe(true)
  })
})
