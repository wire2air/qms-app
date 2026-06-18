import BaseDescriptionList from './BaseDescriptionList.vue'
import BaseDescriptionItem from './BaseDescriptionItem.vue'

/**
 * BaseDescriptionList / BaseDescriptionItem — semantic <dl>/<dt>/<dd> metadata
 * rail for detail-page side panels and overview cards.
 */
export default {
  title: 'Composition/BaseDescriptionList',
  component: BaseDescriptionList,
  tags: ['autodocs'],
  argTypes: {
    layout: { control: 'inline-radio', options: ['inline', 'stacked'] },
    divided: { control: 'boolean' },
  },
  args: { layout: 'inline', divided: true },
}

const render = (args) => ({
  components: { BaseDescriptionList, BaseDescriptionItem },
  setup: () => ({ args }),
  template: `
    <div class="tw:max-w-sm tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:p-4">
      <BaseDescriptionList v-bind="args">
        <BaseDescriptionItem label="CR number" value="CR-2026-014" />
        <BaseDescriptionItem label="Status"><span class="tw:rounded-full tw:bg-info-100 tw:text-info-700 tw:px-2 tw:py-0.5 tw:text-xs tw:font-medium">In review</span></BaseDescriptionItem>
        <BaseDescriptionItem label="Owner" value="Jane Doe" />
        <BaseDescriptionItem label="Department" :value="null" />
      </BaseDescriptionList>
    </div>`,
})

export const Inline = { render, args: { layout: 'inline' } }
export const Stacked = { render, args: { layout: 'stacked', divided: false } }
export const Plain = { render, args: { divided: false } }
