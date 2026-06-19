import BaseRailCard from './BaseRailCard.vue'
import { IconInfoCircle } from '@tabler/icons-vue'

export default {
  title: 'Detail Page/BaseRailCard',
  component: BaseRailCard,
  tags: ['autodocs'],
  argTypes: { collapsible: { control: 'boolean' }, defaultOpen: { control: 'boolean' } },
}

export const Default = {
  args: { title: 'Properties', collapsible: true, defaultOpen: true },
  render: (args) => ({
    components: { BaseRailCard },
    setup: () => ({ args, IconInfoCircle }),
    template: `<div class="tw:w-80"><BaseRailCard v-bind="args" :icon="IconInfoCircle">
      <dl class="tw:text-body"><div class="tw:flex tw:justify-between tw:py-1"><dt class="tw:text-secondary">Owner</dt><dd>Jane Doe</dd></div></dl>
    </BaseRailCard></div>`,
  }),
}

export const NonCollapsible = { ...Default, args: { ...Default.args, collapsible: false } }
