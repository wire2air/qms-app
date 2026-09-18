import BaseSpinner from './BaseSpinner.vue'

/** Canonical loading indicator. Sizes, colors and a centered fill mode. */
export default {
  title: 'Primitives/BaseSpinner',
  component: BaseSpinner,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg', 'xl'] },
    color: { control: 'select', options: ['primary', 'secondary', 'white', 'current'] },
    centered: { control: 'boolean' },
    label: { control: 'text' },
  },
  args: {
    size: 'md',
    color: 'primary',
    centered: false,
    label: 'Loading',
  },
}

const render = (args) => ({
  components: { BaseSpinner },
  setup: () => ({ args }),
  template: `<BaseSpinner v-bind="args" />`,
})

export const Default = { render }

export const Sizes = {
  render: () => ({
    components: { BaseSpinner },
    template: `<div class="tw:flex tw:items-center tw:gap-4">
      <BaseSpinner size="xs" />
      <BaseSpinner size="sm" />
      <BaseSpinner size="md" />
      <BaseSpinner size="lg" />
      <BaseSpinner size="xl" />
    </div>`,
  }),
}

export const Colors = {
  render: () => ({
    components: { BaseSpinner },
    template: `<div class="tw:flex tw:items-center tw:gap-4">
      <BaseSpinner color="primary" />
      <BaseSpinner color="secondary" />
      <div class="tw:rounded tw:bg-neutral-800 tw:p-2"><BaseSpinner color="white" /></div>
    </div>`,
  }),
}

export const Centered = {
  render: () => ({
    components: { BaseSpinner },
    template: `<div class="tw:h-32 tw:w-full tw:rounded-lg tw:border tw:border-divider">
      <BaseSpinner size="lg" :centered="true" />
    </div>`,
  }),
}
