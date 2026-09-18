import { IconCircleCheck } from '@tabler/icons-vue'
import BaseBadge from './BaseBadge.vue'

/** Pill badge. Color comes from a `tw:bg-*` class; supports dot, icon, clearable and selectable. */
export default {
  title: 'Primitives/BaseBadge',
  component: BaseBadge,
  tags: ['autodocs'],
  argTypes: {
    clearable: { control: 'boolean' },
    selectable: { control: 'boolean' },
    showDot: { control: 'boolean' },
  },
  args: {
    clearable: false,
    selectable: false,
    showDot: false,
  },
}

const render = (args) => ({
  components: { BaseBadge },
  setup: () => ({ args }),
  template: `<BaseBadge v-bind="args">Active</BaseBadge>`,
})

export const Default = { render }

export const Colors = {
  render: () => ({
    components: { BaseBadge },
    template: `<div class="tw:flex tw:flex-wrap tw:gap-2">
      <BaseBadge class="tw:bg-green-100 tw:text-green-700">Approved</BaseBadge>
      <BaseBadge class="tw:bg-red-100 tw:text-red-700">Rejected</BaseBadge>
      <BaseBadge class="tw:bg-amber-100 tw:text-amber-700">Pending</BaseBadge>
      <BaseBadge class="tw:bg-gray-100 tw:text-gray-600">Draft</BaseBadge>
    </div>`,
  }),
}

export const WithDot = {
  render: () => ({
    components: { BaseBadge },
    template: `<BaseBadge class="tw:bg-green-100 tw:text-green-700" :showDot="true">Live</BaseBadge>`,
  }),
}

export const Clearable = {
  render: () => ({
    components: { BaseBadge },
    template: `<BaseBadge class="tw:bg-blue-100 tw:text-blue-700" :clearable="true">Filter: Open</BaseBadge>`,
  }),
}

export const WithIcon = {
  render: () => ({
    components: { BaseBadge },
    setup: () => ({ IconCircleCheck }),
    template: `<BaseBadge class="tw:bg-green-100 tw:text-green-700">
      <template #icon><IconCircleCheck class="tw:size-3.5" /></template>
      Verified
    </BaseBadge>`,
  }),
}
