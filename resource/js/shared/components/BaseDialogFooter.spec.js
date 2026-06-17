import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseDialogFooter from './BaseDialogFooter.vue'

const RouterLinkStub = { name: 'RouterLink', template: '<a><slot /></a>' }
const mountFooter = (props = {}) =>
  mount(BaseDialogFooter, { props, global: { stubs: { RouterLink: RouterLinkStub } } })

describe('BaseDialogFooter', () => {
  it('renders Cancel and Save by default', () => {
    const w = mountFooter()
    const btns = w.findAll('button')
    expect(btns).toHaveLength(2)
    expect(w.text()).toContain('Cancel')
    expect(w.text()).toContain('Save')
  })

  it('emits cancel and submit from the respective buttons', async () => {
    const w = mountFooter()
    const [cancel, submit] = w.findAll('button')
    await submit.trigger('click')
    await cancel.trigger('click')
    expect(w.emitted('submit')).toHaveLength(1)
    expect(w.emitted('cancel')).toHaveLength(1)
  })

  it('uses custom labels and variants', () => {
    const w = mountFooter({ cancelLabel: 'Back', submitLabel: 'Create', submitVariant: 'danger' })
    expect(w.text()).toContain('Back')
    expect(w.text()).toContain('Create')
  })

  it('hides the cancel button when hideCancel is set', () => {
    const w = mountFooter({ hideCancel: true })
    expect(w.findAll('button')).toHaveLength(1)
  })

  it('disables both buttons while loading', () => {
    const w = mountFooter({ loading: true })
    expect(w.findAll('button').every((b) => b.attributes('disabled') !== undefined)).toBe(true)
  })

  it('shows an inline error and switches to a space-between layout', () => {
    const w = mountFooter({ error: 'Something went wrong' })
    expect(w.text()).toContain('Something went wrong')
    expect(w.classes().join(' ')).toContain('tw:justify-between')
  })

  it('renders a submitIcon slot inside the submit button', () => {
    const w = mount(BaseDialogFooter, {
      props: { submitLabel: 'Upload' },
      slots: { submitIcon: '<svg data-test="submit-icon" />' },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.find('[data-test="submit-icon"]').exists()).toBe(true)
  })
})
