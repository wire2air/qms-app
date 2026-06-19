import BaseStatStrip from './BaseStatStrip.vue'
import { IconAlertCircle, IconClock, IconAlertTriangle, IconCircleCheck } from '@tabler/icons-vue'

export default {
  title: 'Data Display/BaseStatStrip',
  component: BaseStatStrip,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Compact single-surface KPI strip for list pages — a low-profile metrics bar that keeps the data table as the primary content (vs. the larger BaseStatCard dashboard grid).',
      },
    },
  },
}

export const Default = {
  render: () => ({
    components: { BaseStatStrip },
    setup: () => ({
      items: [
        { key: 'open', label: 'Open NCs', value: 51, icon: IconAlertCircle, color: 'blue' },
        { key: 'overdue', label: 'Overdue', value: 4, icon: IconClock, color: 'red', emphasize: true },
        { key: 'critical', label: 'Critical open', value: 0, icon: IconAlertTriangle, color: 'amber' },
        { key: 'closed', label: 'Closed this month', value: 12, icon: IconCircleCheck, color: 'green' },
      ],
    }),
    template: `<BaseStatStrip :items="items" />`,
  }),
}
