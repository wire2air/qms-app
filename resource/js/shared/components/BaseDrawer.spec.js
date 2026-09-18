import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseDrawer from './BaseDrawer.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

async function settle() {
  await nextTick()
  await nextTick()
}

describe('BaseDrawer', () => {
  it('renders nothing when closed', async () => {
    mount(BaseDrawer, { props: { modelValue: false, title: 'Filters' }, attachTo: document.body })
    await settle()
    expect(document.body.textContent).not.toContain('Filters')
  })

  it('renders the title and body content when open', async () => {
    mount(BaseDrawer, {
      props: { modelValue: true, title: 'Filters' },
      slots: { default: '<p>Drawer body</p>' },
      attachTo: document.body,
    })
    await settle()
    expect(document.body.textContent).toContain('Filters')
    expect(document.body.textContent).toContain('Drawer body')
  })

  it('renders a footer slot when provided', async () => {
    mount(BaseDrawer, {
      props: { modelValue: true, title: 'Filters' },
      slots: { default: '<p>body</p>', footer: '<button>Apply</button>' },
      attachTo: document.body,
    })
    await settle()
    expect(document.body.querySelector('button')).toBeTruthy()
    expect(document.body.textContent).toContain('Apply')
  })
})
