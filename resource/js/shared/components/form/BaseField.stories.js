import { ref } from 'vue'
import BaseField from './BaseField.vue'
import BaseTextInput from '../BaseTextInput.vue'

/** Form-field wrapper: owns label + hint/error + id/aria wiring; slot a control inside. */
export default {
  title: 'Forms/BaseField',
  component: BaseField,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg'] },
    required: { control: 'boolean' },
    optional: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
  args: {
    label: 'Email',
    hint: 'We never share it.',
    required: false,
    optional: false,
    disabled: false,
    size: 'md',
  },
}

export const Default = {
  render: (args) => ({
    components: { BaseField, BaseTextInput },
    setup() {
      const email = ref('')
      return { args, email }
    },
    template: `
      <BaseField v-bind="args">
        <template #default="field">
          <BaseTextInput v-bind="field" v-model="email" placeholder="you@example.com" />
        </template>
      </BaseField>
    `,
  }),
}

export const Required = {
  args: { label: 'Full name', required: true, hint: 'As it appears on your ID.' },
  render: Default.render,
}

export const WithError = {
  args: { label: 'Email', error: 'Enter a valid email address.' },
  render: Default.render,
}

export const Disabled = {
  args: { label: 'Email', disabled: true, hint: 'Editing is locked.' },
  render: Default.render,
}

export const WithHelpAndDescription = {
  args: {
    label: 'API key',
    help: 'Found in your account settings.',
    description: 'Used to authenticate requests.',
    optional: true,
  },
  render: Default.render,
}
