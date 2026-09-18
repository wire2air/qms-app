import BaseFieldRow from './BaseFieldRow.vue'

/**
 * BaseFieldRow — responsive multi-column grid for laying out form fields. Always
 * collapses to one column on mobile. Resize the canvas to see it reflow.
 */
export default {
  title: 'Composition/BaseFieldRow',
  component: BaseFieldRow,
  tags: ['autodocs'],
  argTypes: {
    columns: { control: 'inline-radio', options: [1, 2, 3, 4] },
    gap: { control: 'inline-radio', options: ['comfortable', 'compact'] },
  },
  args: { columns: 2, gap: 'comfortable' },
}

const cell = (n) =>
  `<div class="tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:p-3 tw:text-sm tw:text-secondary">Field ${n}</div>`

export const TwoColumn = {
  render: (args) => ({
    components: { BaseFieldRow },
    setup: () => ({ args }),
    template: `<BaseFieldRow v-bind="args">${[1, 2, 3, 4].map(cell).join('')}</BaseFieldRow>`,
  }),
}

export const ThreeColumn = { ...TwoColumn, args: { columns: 3 } }
export const SingleColumn = { ...TwoColumn, args: { columns: 1 } }
