import { ref } from 'vue'
import BaseCheckbox from './BaseCheckbox.vue'

/** Checkbox with label, indeterminate and disabled states (boolean v-model). */
export default {
  title: 'Forms/BaseCheckbox',
  component: BaseCheckbox,
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
    indeterminate: { control: 'boolean' },
    label: { control: 'text' },
  },
  args: {
    label: 'I accept the terms',
    disabled: false,
    indeterminate: false,
  },
}

export const Default = {
  render: (args) => ({
    components: { BaseCheckbox },
    setup() {
      const model = ref(false)
      return { args, model }
    },
    template: `<BaseCheckbox v-bind="args" v-model="model" />`,
  }),
}

export const Checked = {
  render: (args) => ({
    components: { BaseCheckbox },
    setup() {
      const model = ref(true)
      return { args, model }
    },
    template: `<BaseCheckbox v-bind="args" v-model="model" />`,
  }),
}

export const Indeterminate = {
  args: { label: 'Select all', indeterminate: true },
  render: Default.render,
}

export const Disabled = {
  args: { label: 'Unavailable option', disabled: true },
  render: Default.render,
}

export const SlotLabel = {
  render: (args) => ({
    components: { BaseCheckbox },
    setup() {
      const model = ref(true)
      return { args, model }
    },
    template: `<BaseCheckbox v-bind="args" v-model="model">Custom <strong>slot</strong> label</BaseCheckbox>`,
  }),
}
