import BasePopover from './BasePopover.vue'

/** Floating popover (floating-ui positioned) with a trigger `button` slot and a `content` panel slot. */
export default {
  title: 'Overlays/BasePopover',
  component: BasePopover,
  tags: ['autodocs'],
  argTypes: {
    placement: {
      control: 'select',
      options: ['top', 'bottom', 'left', 'right', 'bottom-end', 'bottom-start', 'top-end'],
    },
    arrow: { control: 'boolean' },
    flip: { control: 'boolean' },
    disabled: { control: 'boolean' },
    offset: { control: 'number' },
  },
  args: {
    placement: 'bottom',
    arrow: true,
    flip: true,
    disabled: false,
    offset: 12,
  },
}

export const Default = {
  render: (args) => ({
    components: { BasePopover },
    setup() {
      return { args }
    },
    template: `
      <div class="tw:flex tw:justify-center tw:py-16">
        <BasePopover v-bind="args">
          <template #button>
            <button class="tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1.5 tw:text-sm">Open popover</button>
          </template>
          <template #content>
            <div class="tw:p-4 tw:text-sm tw:text-on-sidebar">
              <p class="tw:font-medium">Popover panel</p>
              <p class="tw:mt-1 tw:text-secondary">Any content can live in the content slot.</p>
            </div>
          </template>
        </BasePopover>
      </div>`,
  }),
}

export const WithCloseAction = {
  render: (args) => ({
    components: { BasePopover },
    setup() {
      return { args }
    },
    template: `
      <div class="tw:flex tw:justify-center tw:py-16">
        <BasePopover v-bind="args">
          <template #button>
            <button class="tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-1.5 tw:text-sm">Settings</button>
          </template>
          <template #content="{ close }">
            <div class="tw:flex tw:flex-col tw:gap-2 tw:p-4 tw:text-sm">
              <p class="tw:text-secondary">The content slot exposes a close function.</p>
              <button class="tw:self-start tw:rounded-lg tw:bg-primary tw:text-on-primary tw:px-3 tw:py-1 tw:text-sm" @click="close">Done</button>
            </div>
          </template>
        </BasePopover>
      </div>`,
  }),
}

export const TopPlacementNoArrow = {
  args: { placement: 'top', arrow: false },
  render: Default.render,
}
