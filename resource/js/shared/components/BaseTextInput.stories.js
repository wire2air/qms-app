import { ref } from 'vue'
import BaseTextInput from './BaseTextInput.vue'

/** Text input with optional label, placeholder, error, clear button and sizes. */
export default {
  title: 'Forms/BaseTextInput',
  component: BaseTextInput,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'password', 'email', 'datetime-local', 'date', 'number', 'url'],
    },
    size: { control: 'select', options: ['sm', 'md'] },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    clearBtn: { control: 'boolean' },
    labelLeft: { control: 'boolean' },
    labelRight: { control: 'boolean' },
  },
  args: {
    label: 'Email',
    placeholder: 'you@example.com',
    type: 'text',
    size: 'sm',
    disabled: false,
    required: false,
    clearBtn: false,
  },
}

export const Default = {
  render: (args) => ({
    components: { BaseTextInput },
    setup() {
      const model = ref('')
      return { args, model }
    },
    template: `<BaseTextInput v-bind="args" v-model="model" />`,
  }),
}

export const WithError = {
  args: { label: 'Email', errorMsg: 'That email is already taken.' },
  render: Default.render,
}

export const Disabled = {
  args: { label: 'Email', disabled: true },
  render: (args) => ({
    components: { BaseTextInput },
    setup() {
      const model = ref('locked@example.com')
      return { args, model }
    },
    template: `<BaseTextInput v-bind="args" v-model="model" />`,
  }),
}

export const WithClearButton = {
  args: { label: 'Search', placeholder: 'Type to search…', clearBtn: true },
  render: (args) => ({
    components: { BaseTextInput },
    setup() {
      const model = ref('Quality')
      return { args, model }
    },
    template: `<BaseTextInput v-bind="args" v-model="model" />`,
  }),
}

export const MediumSize = {
  args: { label: 'Full name', size: 'md', placeholder: 'Jane Doe', required: true },
  render: Default.render,
}
