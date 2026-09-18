import { describe, it, expect, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import BaseFormDialog from './BaseFormDialog.vue'

const RouterLinkStub = { name: 'RouterLink', template: '<a><slot /></a>' }

let wrapper
function mountDialog(props = {}) {
  wrapper = mount(BaseFormDialog, {
    props: { modelValue: true, title: 'New product', ...props },
    slots: { default: '<div data-test="body">Body</div>' },
    attachTo: document.body,
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  return wrapper
}

// BaseDialog teleports into document.body — unmount + clear between tests so a
// prior dialog's (detached) buttons can't be found by later queries.
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

function findButton(label) {
  return [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes(label))
}

describe('BaseFormDialog', () => {
  it('renders the title, body, and a Cancel/Submit footer when open', async () => {
    mountDialog({ submitLabel: 'Create' })
    await nextTick()
    // BaseDialog teleports into document.body
    expect(document.body.textContent).toContain('New product')
    expect(document.body.querySelector('[data-test="body"]')).not.toBeNull()
    expect(document.body.textContent).toContain('Cancel')
    expect(document.body.textContent).toContain('Create')
  })

  it('emits submit when the submit button is clicked', async () => {
    const w = mountDialog({ submitLabel: 'Create' })
    await nextTick()
    findButton('Create').click()
    expect(w.emitted('submit')).toHaveLength(1)
  })

  it('cancel closes the dialog (v-model false) and emits cancel', async () => {
    const w = mountDialog()
    await nextTick()
    findButton('Cancel').click()
    expect(w.emitted('cancel')).toHaveLength(1)
    expect(w.emitted('update:modelValue').at(-1)).toEqual([false])
  })
})
