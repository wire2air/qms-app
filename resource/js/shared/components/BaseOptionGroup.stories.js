import { ref } from 'vue'
import BaseOptionGroup from './BaseOptionGroup.vue'

/** Radio / checkbox group. `radio` uses a single value; `checkbox`/`toggle` use an array. */
export default {
  title: 'Forms/BaseOptionGroup',
  component: BaseOptionGroup,
  tags: ['autodocs'],
  argTypes: {
    type: { control: 'select', options: ['radio', 'checkbox', 'toggle'] },
    inline: { control: 'boolean' },
    disabled: { control: 'boolean' },
    readonly: { control: 'boolean' },
    error: { control: 'boolean' },
  },
  args: {
    label: 'Priority',
    type: 'radio',
    inline: false,
    disabled: false,
  },
}

// Options are { label, value } objects (the default optionLabel/optionValue keys).
const priorityOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
]

export const Radio = {
  render: (args) => ({
    components: { BaseOptionGroup },
    setup() {
      const model = ref('medium')
      return { args, model, options: priorityOptions }
    },
    template: `<BaseOptionGroup v-bind="args" :options="options" v-model="model" />`,
  }),
}

export const Checkbox = {
  args: { label: 'Categories', type: 'checkbox' },
  render: (args) => ({
    components: { BaseOptionGroup },
    setup() {
      const model = ref(['low', 'high'])
      const options = [
        { label: 'Safety', value: 'low' },
        { label: 'Compliance', value: 'medium' },
        { label: 'Quality', value: 'high' },
      ]
      return { args, model, options }
    },
    template: `<BaseOptionGroup v-bind="args" :options="options" v-model="model" />`,
  }),
}

export const Inline = {
  args: { label: 'Priority', inline: true, hint: 'Pick the one that fits best.' },
  render: Radio.render,
}

export const Disabled = {
  args: { label: 'Priority', disabled: true },
  render: Radio.render,
}

export const WithError = {
  args: { label: 'Priority', error: true, errorMessage: 'Please select a priority.' },
  render: (args) => ({
    components: { BaseOptionGroup },
    setup() {
      const model = ref(null)
      return { args, model, options: priorityOptions }
    },
    template: `<BaseOptionGroup v-bind="args" :options="options" v-model="model" />`,
  }),
}
