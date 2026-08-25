import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseListLayout from './BaseListLayout.vue'

// PageHeader teleports into these app-bar nodes; create them for the test.
function mountLayout(options = {}) {
  return mount(BaseListLayout, { attachTo: document.body, ...options })
}

describe('BaseListLayout', () => {
  let title, actions
  beforeEach(() => {
    title = Object.assign(document.createElement('div'), { id: 'main-header-title' })
    actions = Object.assign(document.createElement('div'), { id: 'main-header-actions' })
    document.body.append(title, actions)
  })
  afterEach(() => {
    title.remove()
    actions.remove()
  })

  it('shows the skeleton while loading and hides the body', () => {
    const w = mountLayout({
      props: { state: 'loading' },
      slots: { default: '<div data-test="body" />' },
    })
    expect(w.find('[data-test="body"]').exists()).toBe(false)
    expect(w.find('[data-test="list-skeleton"]').exists()).toBe(true)
  })

  it('shows the empty state with custom copy', () => {
    const w = mountLayout({
      props: { state: 'empty', emptyTitle: 'No documents yet' },
      slots: { default: '<div data-test="body" />' },
    })
    expect(w.find('[data-test="body"]').exists()).toBe(false)
    expect(w.text()).toContain('No documents yet')
  })

  it('keeps the content region mounted when empty and contentOwnsEmpty is set', () => {
    // The table hosts its own filter controls (search, quick-view tabs), so
    // swapping it out on an empty result would hide the control that emptied it.
    const w = mountLayout({
      props: { state: 'empty', contentOwnsEmpty: true, emptyTitle: 'No documents yet' },
      slots: { default: '<div data-test="body" />' },
    })
    expect(w.find('[data-test="body"]').exists()).toBe(true)
    expect(w.text()).not.toContain('No documents yet')
  })

  it('still swaps to the loading and error states when contentOwnsEmpty is set', () => {
    const loadingW = mountLayout({
      props: { state: 'loading', contentOwnsEmpty: true },
      slots: { default: '<div data-test="body" />' },
    })
    expect(loadingW.find('[data-test="body"]').exists()).toBe(false)
    const errorW = mountLayout({
      props: { state: 'error', contentOwnsEmpty: true, errorTitle: 'Load failed' },
      slots: { default: '<div data-test="body" />' },
    })
    expect(errorW.find('[data-test="body"]').exists()).toBe(false)
    expect(errorW.text()).toContain('Load failed')
  })

  it('shows an error state distinct from empty', () => {
    const w = mountLayout({ props: { state: 'error', errorTitle: 'Load failed' } })
    expect(w.text()).toContain('Load failed')
  })

  it('renders the default slot when ready', () => {
    const w = mountLayout({
      props: { state: 'ready' },
      slots: { default: '<div data-test="body">rows</div>' },
    })
    expect(w.find('[data-test="body"]').exists()).toBe(true)
  })

  it('resolves state from boolean flags when no state prop is given', () => {
    const w = mountLayout({
      props: { error: true },
      slots: { default: '<div data-test="body" />' },
    })
    expect(w.find('[data-test="body"]').exists()).toBe(false)
    expect(w.find('.tw\\:flex-1').exists()).toBe(true) // error region rendered
  })

  it('shows the bulk-action bar with count when rows are selected', () => {
    const w = mountLayout({
      props: { state: 'ready', selectedCount: 3 },
      slots: { 'bulk-actions': '<button data-test="archive">Archive</button>', default: '<div/>' },
    })
    const bar = w.get('[role="toolbar"]')
    expect(bar.attributes('aria-label')).toBe('Bulk actions')
    expect(bar.text()).toContain('3 selected')
    expect(w.find('[data-test="archive"]').exists()).toBe(true)
  })

  it('hides the bulk-action bar when nothing is selected', () => {
    const w = mountLayout({
      props: { state: 'ready', selectedCount: 0 },
      slots: { default: '<div/>' },
    })
    expect(w.find('[role="toolbar"]').exists()).toBe(false)
  })

  it('keeps filters visible across states', () => {
    const w = mountLayout({
      props: { state: 'empty' },
      slots: { filters: '<div data-test="filters" />' },
    })
    expect(w.find('[data-test="filters"]').exists()).toBe(true)
  })
})
