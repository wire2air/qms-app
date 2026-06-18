import BaseChip from './BaseChip.vue'

/** Input/tag chip with optional remove button. */
export default {
  title: 'Primitives/BaseChip',
  component: BaseChip,
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    removable: { control: 'boolean' },
    size: { control: 'select', options: ['sm', 'md'] },
  },
  args: {
    label: 'Engineering',
    removable: false,
    size: 'md',
  },
}

const render = (args) => ({
  components: { BaseChip },
  setup: () => ({ args }),
  template: `<BaseChip v-bind="args" />`,
})

export const Default = { render }

export const Removable = {
  render: () => ({
    components: { BaseChip },
    template: `<BaseChip label="Marketing" :removable="true" />`,
  }),
}

export const Sizes = {
  render: () => ({
    components: { BaseChip },
    template: `<div class="tw:flex tw:items-center tw:gap-2">
      <BaseChip label="Small" size="sm" :removable="true" />
      <BaseChip label="Medium" size="md" :removable="true" />
    </div>`,
  }),
}

export const Group = {
  render: () => ({
    components: { BaseChip },
    template: `<div class="tw:flex tw:flex-wrap tw:gap-2">
      <BaseChip label="Design" :removable="true" />
      <BaseChip label="QA" :removable="true" />
      <BaseChip label="Operations" :removable="true" />
    </div>`,
  }),
}
