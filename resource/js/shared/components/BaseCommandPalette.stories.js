import BaseCommandPalette from './BaseCommandPalette.vue'
import { useCommands } from '../composables/useCommandRegistry.js'
import { IconFileText, IconAlertCircle, IconShield, IconPlus, IconSettings } from '@tabler/icons-vue'

export default {
  title: 'Productivity/BaseCommandPalette',
  component: BaseCommandPalette,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '⌘K / ⌘P command palette (Enterprise Page Framework C4). Fuzzy-searches commands from the central registry — navigation entries (derived from the route-metadata registry) plus feature-contributed actions — grouped, keyboard-driven (↑↓/Enter/Esc), WAI-ARIA combobox + listbox. Mount once near the app root.',
      },
    },
  },
}

export const Default = {
  render: () => ({
    components: { BaseCommandPalette },
    setup() {
      useCommands([
        { id: 'nav.docs', title: 'Go to Documents', group: 'Navigate', icon: IconFileText, perform: () => {} },
        { id: 'nav.nc', title: 'Go to Nonconformances', group: 'Navigate', icon: IconAlertCircle, perform: () => {} },
        { id: 'nav.capa', title: 'Go to CAPAs', group: 'Navigate', icon: IconShield, perform: () => {} },
        { id: 'nav.settings', title: 'Go to Settings', group: 'Navigate', icon: IconSettings, perform: () => {} },
        { id: 'act.nc', title: 'Create nonconformance', group: 'Actions', icon: IconPlus, keywords: ['raise', 'new'], perform: () => {} },
        { id: 'act.capa', title: 'Create CAPA', group: 'Actions', icon: IconPlus, keywords: ['new'], perform: () => {} },
      ])
    },
    template: `
      <div class="tw:p-8 tw:text-body tw:text-secondary">
        Press
        <kbd class="tw:rounded tw:border tw:border-divider tw:bg-main tw:px-1.5 tw:py-0.5 tw:text-caption tw:font-semibold">⌘K</kbd>
        or
        <kbd class="tw:rounded tw:border tw:border-divider tw:bg-main tw:px-1.5 tw:py-0.5 tw:text-caption tw:font-semibold">⌘P</kbd>
        to open the command palette, then type to filter.
        <BaseCommandPalette />
      </div>`,
  }),
}
