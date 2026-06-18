import { IconAlertTriangle, IconClock, IconCircleCheck } from '@tabler/icons-vue'
import BaseStatCard from './BaseStatCard.vue'
import ContentGrid from './ContentGrid.vue'

/**
 * BaseStatCard — a dashboard KPI tile (icon box + value + label + optional
 * trend). Lay several out with ContentGrid.
 */
export default {
  title: 'Data/BaseStatCard',
  component: BaseStatCard,
  tags: ['autodocs'],
  argTypes: {
    iconColor: {
      control: 'select',
      options: ['primary', 'blue', 'green', 'amber', 'red', 'purple', 'gray'],
    },
    loading: { control: 'boolean' },
  },
  args: { label: 'Open NCs', value: 12, iconColor: 'amber', loading: false },
}

export const Default = {
  render: (args) => ({
    components: { BaseStatCard },
    setup: () => ({ args, IconAlertTriangle }),
    template: `<div class="tw:max-w-xs"><BaseStatCard v-bind="args" :icon="IconAlertTriangle" /></div>`,
  }),
}

export const DashboardRow = {
  render: () => ({
    components: { BaseStatCard, ContentGrid },
    setup: () => ({ IconAlertTriangle, IconClock, IconCircleCheck }),
    template: `
      <ContentGrid min="13rem">
        <BaseStatCard label="Open NCs" :value="12" :icon="IconAlertTriangle" iconColor="amber" />
        <BaseStatCard label="Overdue" :value="3" :icon="IconClock" iconColor="red" :trend="{ direction: 'down', value: '-2 vs last wk' }" />
        <BaseStatCard label="Closed" :value="48" :icon="IconCircleCheck" iconColor="green" :trend="{ direction: 'up', value: '+5' }" />
      </ContentGrid>`,
  }),
}

export const Loading = { ...Default, args: { loading: true } }
