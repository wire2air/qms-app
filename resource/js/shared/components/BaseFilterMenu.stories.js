import { ref } from 'vue'
import BaseFilterMenu from './BaseFilterMenu.vue'
import {
  IconCircleDot,
  IconAlertTriangle,
  IconTag,
  IconBuildingFactory2,
  IconCalendar,
  IconUser,
} from '@tabler/icons-vue'

export default {
  title: 'List Workspace/BaseFilterMenu',
  component: BaseFilterMenu,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Cascading filter menu (Linear / VS Code feel): a Filter button opens a recursive flyout built from a descriptor tree. Submenu rows open child panels beside them (unlimited nesting), with inline search on long lists, multi/single select, counts, async children, and floating positioning that never overflows the viewport. v-model = `{ [group]: value[] | value }`.',
      },
    },
  },
}

const STATUS = [
  { value: 'OPEN', label: 'Open', count: 12 },
  { value: 'IN_PROGRESS', label: 'In progress', count: 7 },
  { value: 'UNDER_REVIEW', label: 'Under review', count: 9 },
  { value: 'CLOSED', label: 'Closed', count: 35 },
]
const SEVERITY = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'MAJOR', label: 'Major' },
  { value: 'MINOR', label: 'Minor' },
]
const SUPPLIERS = Array.from({ length: 60 }, (_, i) => ({
  value: `s${i}`,
  label: `Supplier ${String.fromCharCode(65 + (i % 26))}${i}`,
}))

const items = [
  { id: 'status', label: 'Status', icon: IconCircleDot, group: 'statusId', options: STATUS },
  { id: 'severity', label: 'Severity', icon: IconAlertTriangle, group: 'severityId', select: 'radio', options: SEVERITY },
  {
    id: 'type',
    label: 'Type',
    icon: IconTag,
    group: 'typeId',
    options: [
      { value: 'CUSTOMER_RETURN', label: 'Customer return' },
      { value: 'INTERNAL', label: 'Internal' },
    ],
  },
  {
    id: 'date',
    label: 'Date',
    icon: IconCalendar,
    children: [
      { id: 'created', label: 'Created date', group: 'createdRange', options: [
        { value: '7d', label: 'Last 7 days' },
        { value: '30d', label: 'Last 30 days' },
        { value: '90d', label: 'Last 90 days' },
      ] },
      { id: 'due', label: 'Due date', group: 'dueRange', options: [
        { value: 'overdue', label: 'Overdue' },
        { value: 'week', label: 'Due this week' },
      ] },
    ],
  },
  { id: 'supplier', label: 'Supplier', icon: IconBuildingFactory2, group: 'supplierId', searchable: true, options: SUPPLIERS },
  { id: 'owner', label: 'Owner', icon: IconUser, group: 'owner', disabled: true, options: [] },
  { type: 'divider' },
  { id: 'advanced', label: 'Advanced filters…', onSelect: () => {} },
]

export const Default = {
  render: () => ({
    components: { BaseFilterMenu },
    setup() {
      const filters = ref({ statusId: ['OPEN'] })
      return { filters, items }
    },
    template: `
      <div class="tw:p-8">
        <BaseFilterMenu v-model="filters" :items="items" />
        <pre class="tw:mt-4 tw:text-xs tw:text-secondary">{{ filters }}</pre>
      </div>`,
  }),
}
