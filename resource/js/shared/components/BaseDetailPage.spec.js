import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, h } from 'vue'
import BaseDetailPage from './BaseDetailPage.vue'

const StubIcon = { name: 'StubIcon', render: () => h('svg', { 'data-icon': 'true' }) }
// BaseBreadcrumbs renders RouterLink for non-terminal items; stub it so the
// shell mounts without a router instance.
const RouterLinkStub = { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' }

function mountPage(options = {}) {
  return mount(BaseDetailPage, {
    attachTo: document.body,
    ...options,
    global: { stubs: { RouterLink: RouterLinkStub }, ...(options.global || {}) },
  })
}

describe('BaseDetailPage', () => {
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

  it('teleports a simple title + icon into the app header', async () => {
    mountPage({ props: { title: 'CR-001', icon: StubIcon }, slots: { default: '<div/>' } })
    await nextTick()
    await nextTick()
    expect(title.textContent).toContain('CR-001')
    expect(title.querySelector('[data-icon]')).not.toBeNull()
  })

  it('renders breadcrumbs in the header when provided', async () => {
    mountPage({
      props: {
        breadcrumbs: [
          { label: 'Change Requests', to: '/change-requests' },
          { label: 'CR-001' },
        ],
      },
      slots: { default: '<div/>' },
    })
    await nextTick()
    await nextTick()
    expect(title.textContent).toContain('Change Requests')
    expect(title.textContent).toContain('CR-001')
  })

  it('renders the default slot content when not loading or not-found', () => {
    const w = mountPage({ slots: { default: '<div data-test="content"></div>' } })
    expect(w.find('[data-test="content"]').exists()).toBe(true)
  })

  it('shows a loading region and hides the content when loading', () => {
    const w = mountPage({
      props: { loading: true },
      slots: { default: '<div data-test="content"></div>' },
    })
    expect(w.find('[data-test="content"]').exists()).toBe(false)
  })

  it('shows the not-found state with a custom title and hides content', () => {
    const w = mountPage({
      props: { notFound: true, notFoundTitle: 'Change request not found' },
      slots: { default: '<div data-test="content"></div>' },
    })
    expect(w.find('[data-test="content"]').exists()).toBe(false)
    expect(w.text()).toContain('Change request not found')
  })

  it('teleports the actions slot into the header actions zone', async () => {
    mountPage({ props: { title: 'X' }, slots: { actions: '<button>Edit</button>', default: '<div/>' } })
    await nextTick()
    await nextTick()
    expect(actions.textContent).toContain('Edit')
  })

  it('wraps content in an internal scroll region by default (fullHeight)', () => {
    const w = mountPage({ slots: { default: '<div data-test="content"></div>' } })
    const region = w.find('[data-test="content"]').element.parentElement
    expect(region.className).toContain('tw:overflow-auto')
  })
})
