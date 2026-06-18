import BaseLabel from './BaseLabel.vue'

/**
 * BaseLabel — the single source of truth for form-label styling. Renders a real
 * <label> (pass `for` to associate a control) and centralizes the required
 * asterisk, optional hint, help icon, description subtitle, and disabled/error
 * states.
 */
export default {
  title: 'Typography/BaseLabel',
  component: BaseLabel,
  tags: ['autodocs'],
  argTypes: {
    for: { control: 'text' },
    size: { control: 'inline-radio', options: ['xs', 'sm', 'md', 'lg'] },
    weight: { control: 'select', options: ['normal', 'medium', 'semibold', 'bold'] },
    color: {
      control: 'select',
      options: ['default', 'secondary', 'primary', 'error', 'disabled', 'inherit'],
    },
    required: { control: 'boolean' },
    optional: { control: 'boolean' },
    disabled: { control: 'boolean' },
    error: { control: 'boolean' },
    help: { control: 'text' },
    description: { control: 'text' },
    align: { control: 'inline-radio', options: ['left', 'center', 'right'] },
    truncate: { control: 'boolean' },
  },
  args: {
    for: 'email',
    size: 'sm',
    weight: 'medium',
    color: 'default',
    required: false,
    optional: false,
    disabled: false,
    error: false,
    help: '',
    description: '',
    align: 'left',
    truncate: false,
  },
}

const render = (args) => ({
  components: { BaseLabel },
  setup: () => ({ args }),
  template: `<BaseLabel v-bind="args">Email address</BaseLabel>`,
})

export const Default = { render }

/** The decorative required asterisk. */
export const Required = { render, args: { required: true } }

/** The "(optional)" hint. */
export const Optional = { render, args: { optional: true } }

/** Help icon (native title) plus a description subtitle below the label text. */
export const WithHelpAndDescription = {
  render,
  args: {
    help: 'We only use this to send notifications.',
    description: 'Use your work email when possible.',
  },
}

export const ErrorState = { render, args: { error: true, required: true } }

export const Disabled = { render, args: { disabled: true } }
