import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, h } from 'vue'
import PageHeader from './PageHeader.vue'

const StubIcon = { name: 'StubIcon', render: () => h('svg', { 'data-icon': 'true' }) }

describe('PageHeader', () => {
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

  it('teleports the icon + title (as an h1) into #main-header-title', async () => {
    mount(PageHeader, { props: { icon: StubIcon, title: 'Users' }, attachTo: document.body })
    await nextTick() // SafeTeleport gates the teleport behind onMounted
    await nextTick()
    expect(title.textContent).toContain('Users')
    expect(title.querySelector('[data-icon]')).not.toBeNull()
    expect(title.querySelector('h1')).not.toBeNull()
  })

  it('renders the title via the #title slot', async () => {
    mount(PageHeader, {
      props: { title: 'ignored' },
      slots: { title: 'Custom Title' },
      attachTo: document.body,
    })
    await nextTick()
    await nextTick()
    expect(title.textContent).toContain('Custom Title')
  })

  it('teleports actions into #main-header-actions', async () => {
    mount(PageHeader, {
      props: { title: 'X' },
      slots: { actions: '<button>New</button>' },
      attachTo: document.body,
    })
    await nextTick()
    await nextTick()
    expect(actions.textContent).toContain('New')
  })

  it('does not teleport an actions block when no actions slot is given', async () => {
    mount(PageHeader, { props: { title: 'X' }, attachTo: document.body })
    await nextTick()
    await nextTick()
    expect(actions.textContent).toBe('')
  })

  it('accepts a subtitle prop without rendering it in the bar', async () => {
    mount(PageHeader, {
      props: { title: 'X', subtitle: 'should not appear' },
      attachTo: document.body,
    })
    await nextTick()
    await nextTick()
    expect(title.textContent).not.toContain('should not appear')
  })
})
