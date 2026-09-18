import { IconHelpCircle } from '@tabler/icons-vue'
import BaseTooltip from './BaseTooltip.vue'

/**
 * BaseTooltip — accessible hover/focus tooltip on @floating-ui/dom. Shows on
 * hover AND keyboard focus; hides on leave / blur / Escape. Hover the trigger
 * (or Tab to it) to see it.
 */
export default {
  title: 'Overlays/BaseTooltip',
  component: BaseTooltip,
  tags: ['autodocs'],
  argTypes: {
    placement: { control: 'select', options: ['top', 'bottom', 'left', 'right'] },
  },
  args: { content: 'Drives the SLA timers for this record.', placement: 'top' },
}

export const Default = {
  render: (args) => ({
    components: { BaseTooltip },
    setup: () => ({ args }),
    template: `
      <div class="tw:p-10">
        <BaseTooltip v-bind="args">
          <button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm">Hover or focus me</button>
        </BaseTooltip>
      </div>`,
  }),
}

export const OnIcon = {
  render: () => ({
    components: { BaseTooltip },
    setup: () => ({ IconHelpCircle }),
    template: `
      <div class="tw:p-10 tw:flex tw:items-center tw:gap-1 tw:text-sm">
        Priority
        <BaseTooltip content="Higher priority shortens the response SLA.">
          <button type="button" class="tw:inline-flex tw:text-secondary"><component :is="IconHelpCircle" class="tw:size-4" /></button>
        </BaseTooltip>
      </div>`,
  }),
}
