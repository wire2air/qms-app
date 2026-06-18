import { IconUsers } from '@tabler/icons-vue'
import PageSection from './PageSection.vue'

/**
 * PageSection — a titled content group inside a BasePage (BaseSectionHeader +
 * body at the standard spacing). `variant="card"` wraps it in the standard card
 * surface.
 */
export default {
  title: 'Layout/PageSection',
  component: PageSection,
  tags: ['autodocs'],
  argTypes: {
    variant: { control: 'inline-radio', options: ['plain', 'card'] },
    level: { control: 'inline-radio', options: [2, 3, 4] },
  },
  args: { title: 'Members', subtitle: '', variant: 'plain', level: 2 },
}

const render = (args) => ({
  components: { PageSection },
  setup: () => ({ args, IconUsers }),
  template: `
    <div class="tw:max-w-2xl">
      <PageSection v-bind="args" :icon="IconUsers">
        <template #actions>
          <button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm tw:font-medium">Add</button>
        </template>
        <div class="tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:p-4 tw:text-sm tw:text-secondary">Section body content.</div>
      </PageSection>
    </div>`,
})

export const Plain = { render }
export const Card = { render, args: { variant: 'card', subtitle: '3 members' } }
