import BaseAuditTrailRow from './BaseAuditTrailRow.vue'

// Stand-in for a luxon DateTime (the app's axios transformer hands components
// these; formatDate is the project-wide formatter — stubbed here for the story).
const fakeDate = (out) => ({ formatDate: () => out })

/**
 * BaseAuditTrailRow — the small "by {actor} · {date}" actor/timestamp line. The
 * actor comes from the default slot (keeps it decoupled from the user feature).
 */
export default {
  title: 'Composition/BaseAuditTrailRow',
  component: BaseAuditTrailRow,
  tags: ['autodocs'],
  argTypes: { date: { control: false } },
  args: { prefix: 'by', separator: '·', date: fakeDate('Jun 18, 2026, 2:00 PM') },
}

const render = (args) => ({
  components: { BaseAuditTrailRow },
  setup: () => ({ args }),
  template: `
    <BaseAuditTrailRow v-bind="args">
      <span class="tw:inline-flex tw:items-center tw:gap-1 tw:font-medium tw:text-on-main">
        <span class="tw:inline-flex tw:size-4 tw:items-center tw:justify-center tw:rounded-full tw:bg-primary tw:text-on-primary tw:text-[8px]">JD</span>
        Jane Doe
      </span>
    </BaseAuditTrailRow>`,
})

export const Default = { render }
export const CustomPrefix = { render, args: { prefix: 'Voided by', date: fakeDate('Jun 17, 2026') } }
export const ActorOnly = { render, args: { date: null } }
