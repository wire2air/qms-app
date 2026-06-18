import { IconTrash } from '@tabler/icons-vue'
import BaseButton from './BaseButton.vue'

/** Canonical button. Variants, sizes, loading and icon-only modes. */
export default {
  title: 'Primitives/BaseButton',
  component: BaseButton,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'primary',
        'danger',
        'warning',
        'secondary',
        'outline',
        'text',
        'text-link',
        'transparent',
        'filter',
      ],
    },
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
    isLoading: { control: 'boolean' },
    iconOnly: { control: 'boolean' },
  },
  args: {
    variant: 'primary',
    size: 'md',
    disabled: false,
    isLoading: false,
    iconOnly: false,
  },
}

const render = (args) => ({
  components: { BaseButton },
  setup: () => ({ args }),
  template: `<BaseButton v-bind="args">Click me</BaseButton>`,
})

export const Default = { render }

export const Variants = {
  render: () => ({
    components: { BaseButton },
    template: `<div class="tw:flex tw:flex-wrap tw:gap-2">
      <BaseButton variant="primary">Primary</BaseButton>
      <BaseButton variant="secondary">Secondary</BaseButton>
      <BaseButton variant="danger">Danger</BaseButton>
      <BaseButton variant="warning">Warning</BaseButton>
      <BaseButton variant="outline">Outline</BaseButton>
      <BaseButton variant="text">Text</BaseButton>
      <BaseButton variant="text-link">Text link</BaseButton>
    </div>`,
  }),
}

export const Sizes = {
  render: () => ({
    components: { BaseButton },
    template: `<div class="tw:flex tw:items-center tw:gap-2">
      <BaseButton size="xs">XS</BaseButton>
      <BaseButton size="sm">SM</BaseButton>
      <BaseButton size="md">MD</BaseButton>
      <BaseButton size="lg">LG</BaseButton>
    </div>`,
  }),
}

export const Loading = {
  render: () => ({
    components: { BaseButton },
    template: `<BaseButton :isLoading="true">Saving</BaseButton>`,
  }),
}

export const IconOnly = {
  render: () => ({
    components: { BaseButton },
    setup: () => ({ IconTrash }),
    template: `<BaseButton variant="danger" iconOnly aria-label="Delete">
      <template #icon><IconTrash class="tw:size-4" /></template>
    </BaseButton>`,
  }),
}
