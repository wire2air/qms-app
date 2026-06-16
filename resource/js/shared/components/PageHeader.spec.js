import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, h } from 'vue'
import PageHeader from './PageHeader.vue'

const StubIcon = { name: 'StubIcon', render: () => h('svg', { 'data-icon': 'true' }) }

describe('PageHeader', () => {
  let target, actionsTarget
  beforeEach(() => {
    target = document.createElement('div')
    target.id = 'main-header-title'
    actionsTarget = document.createElement('div')
    actionsTarget.id = 'main-header-actions'
    document.body.append(target, actionsTarget)
  })
  afterEach(() => {
    target.remove()
    actionsTarget.remove()
  })

  it('teleports the icon + title into #main-header-title', async () => {
    mount(PageHeader, { props: { icon: StubIcon, title: 'Departments' }, attachTo: document.body })
    await nextTick() // SafeTeleport gates teleport behind onMounted
    await nextTick()
    expect(target.textContent).toContain('Departments')
    expect(target.querySelector('[data-icon]')).not.toBeNull()
    const h2 = target.querySelector('h2')
    expect(h2).not.toBeNull()
  })

  it('renders title via slot and teleports actions into #main-header-actions', async () => {
    mount(PageHeader, {
      props: { title: 'ignored' },
      slots: { title: 'Custom Title', actions: '<button>New</button>' },
      attachTo: document.body,
    })
    await nextTick()
    await nextTick()
    expect(target.textContent).toContain('Custom Title')
    expect(actionsTarget.textContent).toContain('New')
  })
})
