import { IconInfoCircle } from '@tabler/icons-vue'
import BaseSectionHeader from './BaseSectionHeader.vue'

/**
 * BaseSectionHeader — "title (+icon/subtitle) left, actions right" header for
 * cards and page sections. Renders a real heading for document-outline semantics.
 */
export default {
  title: 'Composition/BaseSectionHeader',
  component: BaseSectionHeader,
  tags: ['autodocs'],
  argTypes: {
    iconVariant: { control: 'inline-radio', options: ['plain', 'boxed'] },
    iconColor: {
      control: 'select',
      options: ['primary', 'blue', 'green', 'amber', 'red', 'purple', 'gray'],
    },
    level: { control: 'inline-radio', options: [2, 3, 4] },
  },
  args: { title: 'Basic information', subtitle: '', iconVariant: 'plain', iconColor: 'primary', level: 3 },
}

const render = (args) => ({
  components: { BaseSectionHeader },
  setup: () => ({ args, IconInfoCircle }),
  template: `
    <div class="tw:max-w-xl tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:p-4">
      <BaseSectionHeader v-bind="args" :icon="IconInfoCircle">
        <template #actions>
          <button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm tw:font-medium">Edit</button>
        </template>
      </BaseSectionHeader>
    </div>`,
})

export const Plain = { render }
export const Boxed = { render, args: { iconVariant: 'boxed', subtitle: '4 fields' } }
