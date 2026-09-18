import BaseText from './BaseText.vue'

/**
 * BaseText — the workhorse body/inline text primitive. Pass `variant` for the
 * semantic style and override individual dimensions (`color`, `weight`, `align`).
 */
export default {
  title: 'Typography/BaseText',
  component: BaseText,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'page-title',
        'section-title',
        'subheading',
        'body',
        'caption',
        'helper',
        'error',
        'overline',
      ],
    },
    as: { control: 'text' },
    color: {
      control: 'select',
      options: [null, 'default', 'secondary', 'primary', 'error', 'disabled', 'inherit'],
    },
    weight: { control: 'select', options: [null, 'normal', 'medium', 'semibold', 'bold'] },
    align: { control: 'inline-radio', options: ['left', 'center', 'right'] },
    truncate: { control: 'boolean' },
    lines: { control: 'select', options: [null, 1, 2, 3, 4] },
  },
  args: {
    variant: 'body',
    align: 'left',
    truncate: false,
  },
}

const render = (args) => ({
  components: { BaseText },
  setup: () => ({ args }),
  template: `<BaseText v-bind="args">The quick brown fox jumps over the lazy dog</BaseText>`,
})

export const Default = { render }

export const Caption = { render, args: { variant: 'caption' } }

export const Overline = { render, args: { variant: 'overline' } }

export const PrimaryBold = { render, args: { color: 'primary', weight: 'bold' } }

/** Clamp long content to two lines. */
export const Clamped = {
  render: (args) => ({
    components: { BaseText },
    setup: () => ({ args }),
    template: `<div style="max-width: 16rem"><BaseText v-bind="args">The quick brown fox jumps over the lazy dog while the slow cat watches lazily from the warm windowsill.</BaseText></div>`,
  }),
  args: { lines: 2 },
}
