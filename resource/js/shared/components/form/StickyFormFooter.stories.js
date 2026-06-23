import StickyFormFooter from './StickyFormFooter.vue'

/**
 * StickyFormFooter — the bottom-pinned action bar for long forms. Submit/cancel
 * + a status region (dirty marker, inline error, or a slotted AutosaveIndicator).
 */
export default {
  title: 'Forms/StickyFormFooter',
  component: StickyFormFooter,
  tags: ['autodocs'],
  argTypes: {
    submitVariant: {
      control: 'select',
      options: ['primary', 'secondary', 'danger', 'outline'],
    },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    dirty: { control: 'boolean' },
    hideCancel: { control: 'boolean' },
  },
  args: {
    submitLabel: 'Raise NC',
    cancelLabel: 'Cancel',
    submitVariant: 'primary',
    loading: false,
    disabled: false,
    dirty: false,
    hideCancel: false,
    error: '',
    submitHint: '',
  },
  decorators: [
    () => ({ template: '<div class="tw:max-w-2xl tw:border tw:border-divider tw:rounded-xl tw:overflow-hidden tw:bg-main"><story /></div>' }),
  ],
}

const render = (args) => ({
  components: { StickyFormFooter },
  setup: () => ({ args }),
  template: `<StickyFormFooter v-bind="args" />`,
})

/** Idle — no status, submit + cancel. */
export const Default = { render }

/** Unsaved-changes marker on the left (explicit-submit forms). */
export const Dirty = { args: { dirty: true }, render }

/** Submit in progress — primary button spins, cancel disabled. */
export const Loading = { args: { loading: true, dirty: true }, render }

/** A failed server save surfaced inline (replaces the vanishing error toast). */
export const WithError = {
  args: { error: 'Could not raise NC — workflow version no longer exists.' },
  render,
}

/** Disabled submit (validation gate not met). */
export const DisabledSubmit = { args: { disabled: true }, render }

/** Keyboard hint + no cancel. */
export const WithHintNoCancel = {
  args: { submitHint: '⌘↵', hideCancel: true, dirty: true },
  render,
}

/**
 * In a scroll context — the footer sticks to the bottom while the form body
 * scrolls under it. Scroll the panel to see the bar stay pinned.
 */
export const StickyInScroll = {
  render: (args) => ({
    components: { StickyFormFooter },
    setup: () => ({ args }),
    template: `
      <div class="tw:h-80 tw:overflow-y-auto tw:flex tw:flex-col">
        <div class="tw:flex-1 tw:p-4 tw:flex tw:flex-col tw:gap-3">
          <p v-for="n in 14" :key="n" class="tw:h-9 tw:rounded-lg tw:bg-sidebar tw:flex tw:items-center tw:px-3 tw:text-sm tw:text-secondary">Form field {{ n }}</p>
        </div>
        <StickyFormFooter v-bind="args" dirty />
      </div>`,
  }),
}
