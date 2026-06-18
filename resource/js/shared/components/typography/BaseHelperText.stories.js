import BaseHelperText from './BaseHelperText.vue'

/**
 * BaseHelperText — form field hint rendered as a <p> using the shared `helper`
 * token (caption size, secondary color). Pass an `id` (falls through) and
 * reference it from the control's `aria-describedby`.
 */
export default {
  title: 'Typography/BaseHelperText',
  component: BaseHelperText,
  tags: ['autodocs'],
  argTypes: {
    id: { control: 'text' },
  },
  args: {
    id: 'email-help',
  },
}

const render = (args) => ({
  components: { BaseHelperText },
  setup: () => ({ args }),
  template: `<BaseHelperText v-bind="args">We'll never share your email with anyone else.</BaseHelperText>`,
})

export const Default = { render }

export const ShortHint = {
  render: (args) => ({
    components: { BaseHelperText },
    setup: () => ({ args }),
    template: `<BaseHelperText v-bind="args">Minimum 8 characters.</BaseHelperText>`,
  }),
}
