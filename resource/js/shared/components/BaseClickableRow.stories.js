import BaseClickableRow from './BaseClickableRow.vue'

/**
 * Keyboard-accessible clickable container. Stories use button mode (no `to` prop),
 * so no router is required. Always pass an `aria-label`.
 */
export default {
  title: 'Primitives/BaseClickableRow',
  component: BaseClickableRow,
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
    tag: { control: 'text' },
  },
  args: {
    disabled: false,
    tag: 'div',
  },
}

const render = (args) => ({
  components: { BaseClickableRow },
  setup: () => ({ args }),
  template: `<BaseClickableRow
    v-bind="args"
    aria-label="Open item"
    class="tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:px-4 tw:py-3 tw:hover:bg-sidebar-hover"
  >
    <div class="tw:flex tw:items-center tw:justify-between">
      <span class="tw:font-medium tw:text-on-sidebar">Document title</span>
      <span class="tw:text-sm tw:text-secondary">Updated today</span>
    </div>
  </BaseClickableRow>`,
})

export const Default = { render }

export const Disabled = {
  render: () => ({
    components: { BaseClickableRow },
    template: `<BaseClickableRow
      :disabled="true"
      aria-label="Open item"
      class="tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:px-4 tw:py-3 tw:opacity-60"
    >
      <span class="tw:font-medium tw:text-on-sidebar">Locked row</span>
    </BaseClickableRow>`,
  }),
}

export const List = {
  render: () => ({
    components: { BaseClickableRow },
    template: `<div class="tw:flex tw:flex-col tw:gap-2">
      <BaseClickableRow
        v-for="n in 3"
        :key="n"
        :aria-label="'Open row ' + n"
        class="tw:rounded-lg tw:border tw:border-divider tw:bg-sidebar tw:px-4 tw:py-3 tw:hover:bg-sidebar-hover"
      >
        <span class="tw:text-on-sidebar">Row {{ n }}</span>
      </BaseClickableRow>
    </div>`,
  }),
}
