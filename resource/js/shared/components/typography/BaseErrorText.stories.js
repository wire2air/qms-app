import BaseErrorText from './BaseErrorText.vue'

/**
 * BaseErrorText — form field error rendered as a <p role="alert"> using the
 * shared `error` token (caption size, medium weight, bad/error color). Pass an
 * `id` (falls through) and wire it to the control's `aria-describedby` +
 * `aria-invalid`.
 */
export default {
  title: 'Typography/BaseErrorText',
  component: BaseErrorText,
  tags: ['autodocs'],
  argTypes: {
    id: { control: 'text' },
  },
  args: {
    id: 'email-error',
  },
}

const render = (args) => ({
  components: { BaseErrorText },
  setup: () => ({ args }),
  template: `<BaseErrorText v-bind="args">Please enter a valid email address.</BaseErrorText>`,
})

export const Default = { render }

export const RequiredFieldError = {
  render: (args) => ({
    components: { BaseErrorText },
    setup: () => ({ args }),
    template: `<BaseErrorText v-bind="args">This field is required.</BaseErrorText>`,
  }),
}
