import BaseHeading from './BaseHeading.vue'

/**
 * BaseHeading — semantic headings. `level` (1–6) controls BOTH the rendered
 * <h1>–<h6> tag (document outline) and the default visual size. Pass `as` to
 * override only the visual size, decoupling structure from style.
 */
export default {
  title: 'Typography/BaseHeading',
  component: BaseHeading,
  tags: ['autodocs'],
  argTypes: {
    level: { control: 'inline-radio', options: [1, 2, 3, 4, 5, 6] },
    as: {
      control: 'select',
      options: [null, 'page-title', 'section-title', 'subheading', 'body', 'caption', 'overline'],
    },
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
    level: 2,
    align: 'left',
    truncate: false,
  },
}

const render = (args) => ({
  components: { BaseHeading },
  setup: () => ({ args }),
  template: `<BaseHeading v-bind="args">The quick brown fox jumps over the lazy dog</BaseHeading>`,
})

export const Default = { render }

export const PageTitle = { render, args: { level: 1 } }

export const Subheading = { render, args: { level: 3 } }

/** An <h2> tag (document outline) that visually looks like a page title via `as`. */
export const VisualOverride = { render, args: { level: 2, as: 'page-title' } }

export const ColoredPrimary = { render, args: { level: 2, color: 'primary' } }
