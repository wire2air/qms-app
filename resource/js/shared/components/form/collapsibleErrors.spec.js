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
    await bf.vm.submit() // flags the empty required field
    await nextTick()
    expect(bodyDisplay(wrapper)).toBe('none') // still collapsed until we jump

    await bf.vm.focusField('f-supplier') // e.g. user clicks the summary entry
    await nextTick()
    expect(bodyDisplay(wrapper)).not.toBe('none') // now expanded so the error is visible
  })
})
