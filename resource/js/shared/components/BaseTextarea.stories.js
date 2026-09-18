import { ref } from 'vue'
import BaseTextarea from './BaseTextarea.vue'

/** Multi-line text input with label, placeholder, error, rows, autosize and disabled states. */
export default {
  title: 'Forms/BaseTextarea',
  component: BaseTextarea,
  tags: ['autodocs'],
  argTypes: {
    rows: { control: 'number' },
    maxlength: { control: 'number' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    autosize: { control: 'boolean' },
  },
  args: {
    label: 'Notes',
    placeholder: 'Add any additional details…',
    rows: 3,
    disabled: false,
    required: false,
    autosize: false,
  },
}

export const Default = {
  render: (args) => ({
    components: { BaseTextarea },
    setup() {
      const model = ref('')
      return { args, model }
    },
    template: `<BaseTextarea v-bind="args" v-model="model" />`,
  }),
}

export const WithError = {
  args: { label: 'Notes', errorMsg: 'This field is required.' },
  render: Default.render,
}

export const Disabled = {
  args: { label: 'Notes', disabled: true },
  render: (args) => ({
    components: { BaseTextarea },
    setup() {
      const model = ref('This content cannot be edited.')
      return { args, model }
    },
    template: `<BaseTextarea v-bind="args" v-model="model" />`,
  }),
}

export const Autosize = {
  args: { label: 'Description', autosize: true, rows: 2, maxRows: 6 },
  render: (args) => ({
    components: { BaseTextarea },
    setup() {
      const model = ref('Type a few lines and the textarea grows to fit the content.')
      return { args, model }
    },
    template: `<BaseTextarea v-bind="args" v-model="model" />`,
  }),
}

export const WithInstructions = {
  args: {
    label: 'Feedback',
    instructions: 'Keep it under 500 characters.',
    maxlength: 500,
    required: true,
  },
  render: Default.render,
}
