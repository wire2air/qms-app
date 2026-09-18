import HotkeyHelp from './HotkeyHelp.vue'
import { useHotkeys } from '../composables/useHotkeys.js'

export default {
  title: 'Productivity/HotkeyHelp',
  component: HotkeyHelp,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The `?` keyboard-shortcut cheat-sheet (Enterprise Page Framework F5). Lists every shortcut registered via `useHotkeys` (those with a `description`), grouped, with platform-aware <kbd> chips. Mount once near the app root.',
      },
    },
  },
}

export const Default = {
  render: () => ({
    components: { HotkeyHelp },
    setup() {
      useHotkeys([
        { keys: 'mod+k', description: 'Open command palette', group: 'Global', handler: () => {} },
        { keys: '/', description: 'Focus search', group: 'Global', handler: () => {} },
        { keys: '?', description: 'Show keyboard shortcuts', group: 'General', handler: () => {} },
        { keys: 'c', description: 'Create new record', group: 'Actions', handler: () => {} },
        { keys: 'mod+s', description: 'Save changes', group: 'Actions', handler: () => {} },
        { keys: 'mod+shift+p', description: 'Print', group: 'Actions', handler: () => {} },
      ])
    },
    template: `
      <div class="tw:p-8 tw:text-body tw:text-secondary">
        Press <kbd class="tw:rounded tw:border tw:border-divider tw:bg-main tw:px-1.5 tw:py-0.5 tw:text-caption tw:font-semibold">?</kbd> to open the shortcuts overlay.
        <HotkeyHelp />
      </div>`,
  }),
}
