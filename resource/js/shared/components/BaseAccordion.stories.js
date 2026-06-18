import { ref } from 'vue'
import BaseAccordion from './BaseAccordion.vue'

/** BaseAccordion — accessible collapsible sections. */
export default {
  title: 'Data/BaseAccordion',
  component: BaseAccordion,
  tags: ['autodocs'],
  argTypes: { multiple: { control: 'boolean' } },
  args: { multiple: false },
}

const ITEMS = [
  { value: 'overview', title: 'Overview' },
  { value: 'history', title: 'History' },
  { value: 'locked', title: 'Locked section', disabled: true },
]

export const Default = {
  render: (args) => ({
    components: { BaseAccordion },
    setup: () => ({ args, items: ITEMS, open: ref(['overview']) }),
    template: `
      <div class="tw:max-w-lg">
        <BaseAccordion v-bind="args" v-model="open" :items="items">
          <template #overview>The record overview and key metadata.</template>
          <template #history>Audit trail and version history.</template>
        </BaseAccordion>
      </div>`,
  }),
}

export const Multiple = { ...Default, args: { multiple: true } }
