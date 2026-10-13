import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import BaseForm from './BaseForm.vue'
import FormSection from './FormSection.vue'
import BaseField from './BaseField.vue'
import { required } from './validators.js'

// A collapsed section that contains an invalid field must auto-expand when the
// form jumps to that error — otherwise the error (and the control) is hidden
// inside a display:none body and the user can neither see nor fix it. (C1)
function mountCollapsedForm() {
  const form = reactive({ supplierId: null })
  const wrapper = mount(
    {
      components: { BaseForm, FormSection, BaseField },
      setup: () => ({ form, required }),
      template: `
        <BaseForm :validate="null">
          <FormSection id="sec-product" title="Product" collapsible :defaultOpen="false">
            <BaseField id="f-supplier" label="Supplier" :value="form.supplierId" :rules="[required()]">
              <template #default="field"><input v-bind="field" /></template>
            </BaseField>
          </FormSection>
        </BaseForm>
      `,
    },
    { attachTo: document.body },
  )
  const bf = wrapper.findComponent(BaseForm)
  return { wrapper, bf }
}

function bodyDisplay(wrapper) {
  return wrapper.find('#sec-product-body').element.style.display
}

describe('collapsed section auto-expands on error (C1)', () => {
  it('starts collapsed', () => {
    const { wrapper } = mountCollapsedForm()
    expect(bodyDisplay(wrapper)).toBe('none')
  })

  it('expands the section when the form focuses a field inside it', async () => {
    const { wrapper, bf } = mountCollapsedForm()
    await bf.vm.focusField('f-supplier') // e.g. user clicks the summary entry
    await nextTick()
    expect(bodyDisplay(wrapper)).not.toBe('none') // now expanded so the error is visible
  })

  // A failed submit jumps to the FIRST invalid field by itself (2026-10-08):
  // the user must land on the problem, not on an unchanged screen with a
  // summary somewhere above the fold.
  it('a failed submit jumps to the first invalid field, expanding its section', async () => {
    const { wrapper, bf } = mountCollapsedForm()
    expect(bodyDisplay(wrapper)).toBe('none')
    await bf.vm.submit() // flags the empty required field
    await nextTick()
    expect(bodyDisplay(wrapper)).not.toBe('none')
    expect(document.activeElement?.id).toBe('f-supplier')
  })
})

// A control that does NOT spread BaseField's slot payload (an editor inside a
// plain <div>) carries no id, so the jump used to find nothing and do nothing.
// focusField falls back to the `<id>-field` wrapper and focuses the input
// surface inside it — not the toolbar button that precedes it (2026-10-08).
describe('jump to a field whose control did not spread the id', () => {
  it('lands on the editable surface via the BaseField wrapper', async () => {
    const form = reactive({ body: '' })
    const wrapper = mount(
      {
        components: { BaseForm, BaseField },
        setup: () => ({ form, required }),
        template: `
          <BaseForm :validate="null">
            <BaseField id="f-body" label="Body" :value="form.body" :rules="[required()]">
              <div class="editor">
                <button type="button" id="bold-btn">B</button>
                <div id="surface" contenteditable="true" tabindex="0"></div>
              </div>
            </BaseField>
          </BaseForm>
        `,
      },
      { attachTo: document.body },
    )
    expect(wrapper.find('#f-body').exists()).toBe(false) // control never got the id
    expect(wrapper.find('#f-body-field').exists()).toBe(true) // wrapper did
    const bf = wrapper.findComponent(BaseForm)
    await bf.vm.submit()
    await nextTick()
    expect(document.activeElement?.id).toBe('surface')
    wrapper.unmount()
  })
})
