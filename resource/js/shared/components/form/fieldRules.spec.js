import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import BaseForm from './BaseForm.vue'
import BaseField from './BaseField.vue'
import { required, requiredWhen } from './validators.js'

// Mounts a real BaseForm with BaseFields that carry :value + :rules, exercising
// the self-registration → collect-on-submit pipeline end to end.
function mountForm() {
  const form = reactive({ title: '', supplierId: null, isSupplierFacing: false })
  const submitted = { count: 0 }
  const wrapper = mount(
    {
      components: { BaseForm, BaseField },
      setup() {
        return { form, required, requiredWhen, onSubmit: () => (submitted.count += 1) }
      },
      template: `
        <BaseForm :validate="null" @submit="onSubmit">
          <BaseField id="f-title" label="Title" :value="form.title" :rules="[required()]">
            <template #default="field"><input v-bind="field" /></template>
          </BaseField>
          <BaseField id="f-supplier" label="Supplier" :value="form.supplierId"
            :rules="[requiredWhen(() => form.isSupplierFacing, 'Pick a supplier first.')]">
            <template #default="field"><input v-bind="field" /></template>
          </BaseField>
        </BaseForm>
      `,
    },
    { attachTo: document.body },
  )
  const submit = () => wrapper.findComponent(BaseForm).vm.submit()
  return { wrapper, form, submitted, submit }
}

describe('BaseField rules ↔ BaseForm collection', () => {
  it('blocks submit and shows an inline error for an empty required field', async () => {
    const { wrapper, submitted, submit } = mountForm()
    await submit()
    await nextTick()

    expect(submitted.count).toBe(0)
    // Inline error rendered under the Title field.
    expect(wrapper.text()).toContain('Title is required.')
  })

  it('surfaces the same error in the ValidationSummary', async () => {
    const { wrapper, submit } = mountForm()
    await submit()
    await nextTick()
    // Summary lists the field label + message. Two occurrences (summary + inline).
    expect(wrapper.text().match(/is required\./g)?.length).toBeGreaterThanOrEqual(1)
    expect(wrapper.findComponent({ name: 'ValidationSummary' }).exists()).toBe(true)
  })

  it('emits submit once every field is valid', async () => {
    const { form, submitted, submit } = mountForm()
    form.title = 'A real title'
    await nextTick()
    await submit()
    expect(submitted.count).toBe(1)
  })

  it('clears a field error live after it was flagged, once the value becomes valid', async () => {
    const { wrapper, form, submit } = mountForm()
    await submit()
    await nextTick()
    expect(wrapper.text()).toContain('Title is required.')

    form.title = 'Fixed'
    await nextTick()
    await nextTick()
    expect(wrapper.text()).not.toContain('Title is required.')
  })

  it('honors a cross-field requiredWhen rule that closes over the form', async () => {
    const { wrapper, form, submitted, submit } = mountForm()
    form.title = 'ok'
    form.isSupplierFacing = true
    await nextTick()
    await submit()
    await nextTick()

    expect(submitted.count).toBe(0)
    expect(wrapper.text()).toContain('Pick a supplier first.')

    form.supplierId = 'sup-1'
    await nextTick()
    await submit()
    expect(submitted.count).toBe(1)
  })
})
