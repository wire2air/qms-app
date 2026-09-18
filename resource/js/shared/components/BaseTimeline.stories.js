import { IconFileText, IconCheck, IconMessageCircle } from '@tabler/icons-vue'
import BaseTimeline from './BaseTimeline.vue'

/** Vertical activity/event feed with status-colored nodes and a connector rail. */
export default {
  title: 'Data/BaseTimeline',
  component: BaseTimeline,
  tags: ['autodocs'],
  args: {
    dense: false,
  },
}

// item: { title?, subtitle?, time?, icon?, color? }
// color ∈ 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'neutral'
const items = [
  { id: 1, title: 'Document created', subtitle: 'by Ada Lovelace', time: '3 days ago', color: 'primary' },
  { id: 2, title: 'Submitted for review', subtitle: 'Version 1.0', time: '2 days ago', color: 'info' },
  { id: 3, title: 'Changes requested', subtitle: 'Reviewer: Grace Hopper', time: '1 day ago', color: 'warning' },
  { id: 4, title: 'Approved', subtitle: 'Version 1.1 published', time: '2 hours ago', color: 'success' },
]

export const Default = {
  render: (args) => ({
    components: { BaseTimeline },
    setup() {
      return { args, items }
    },
    template: `<BaseTimeline v-bind="args" :items="items" />`,
  }),
}

export const Dense = {
  args: { dense: true },
  render: (args) => ({
    components: { BaseTimeline },
    setup() {
      return { args, items }
    },
    template: `<BaseTimeline v-bind="args" :items="items" />`,
  }),
}

export const WithIcons = {
  render: (args) => ({
    components: { BaseTimeline },
    setup() {
      const iconItems = [
        { id: 1, title: 'Created', subtitle: 'Initial draft', time: '3d', icon: IconFileText, color: 'primary' },
        { id: 2, title: 'Comment added', subtitle: 'Reviewer note', time: '2d', icon: IconMessageCircle, color: 'info' },
        { id: 3, title: 'Approved', subtitle: 'Ready to publish', time: '1d', icon: IconCheck, color: 'success' },
      ]
      return { args, iconItems }
    },
    template: `<BaseTimeline v-bind="args" :items="iconItems" />`,
  }),
}

export const CustomItemSlot = {
  render: (args) => ({
    components: { BaseTimeline },
    setup() {
      return { args, items }
    },
    template: `
      <BaseTimeline v-bind="args" :items="items">
        <template #item="{ item }">
          <div class="tw:rounded-lg tw:border tw:border-divider tw:p-3">
            <div class="tw:text-sm tw:font-semibold tw:text-on-main">{{ item.title }}</div>
            <div class="tw:text-xs tw:text-secondary">{{ item.subtitle }} · {{ item.time }}</div>
          </div>
        </template>
      </BaseTimeline>`,
  }),
}
