import AutosaveIndicator from './AutosaveIndicator.vue'
import StickyFormFooter from './StickyFormFooter.vue'

/**
 * AutosaveIndicator — shared "Saving… / Saved / Couldn't save" status for
 * autosave forms. Maps directly from useAutoSave's isSaving / saveError.
 */
export default {
  title: 'Forms/AutosaveIndicator',
  component: AutosaveIndicator,
  tags: ['autodocs'],
  argTypes: {
    state: { control: 'inline-radio', options: ['idle', 'saving', 'saved', 'error'] },
    retryable: { control: 'boolean' },
  },
  args: { state: 'saving', savedAtLabel: '', retryable: true },
  decorators: [
    () => ({ template: '<div class="tw:p-4 tw:bg-main"><story /></div>' }),
  ],
}

const render = (args) => ({
  components: { AutosaveIndicator },
  setup: () => ({ args }),
  template: `<AutosaveIndicator v-bind="args" />`,
})

/** Saving — spinner + "Saving…". */
export const Saving = { args: { state: 'saving' }, render }

/** Saved — green check. */
export const Saved = { args: { state: 'saved' }, render }

/** Saved with a caller-formatted timestamp. */
export const SavedWithTime = { args: { state: 'saved', savedAtLabel: '2:45 PM' }, render }

/** Error — with a Retry action. */
export const Error = { args: { state: 'error' }, render }

/** Idle renders nothing. */
export const Idle = {
  args: { state: 'idle' },
  render: (args) => ({
    components: { AutosaveIndicator },
    setup: () => ({ args }),
    template: `<div><AutosaveIndicator v-bind="args" /><span class="tw:text-xs tw:text-secondary">(idle — nothing rendered)</span></div>`,
  }),
}

/**
 * In StickyFormFooter — the autosave detail-page pattern: the indicator lives in
 * the footer's #status slot instead of a "dirty" marker.
 */
export const InFooter = {
  render: (args) => ({
    components: { AutosaveIndicator, StickyFormFooter },
    setup: () => ({ args }),
    template: `
      <div class="tw:max-w-2xl tw:border tw:border-divider tw:rounded-xl tw:overflow-hidden">
        <StickyFormFooter submitLabel="Close" hideCancel>
          <template #status>
            <AutosaveIndicator v-bind="args" />
          </template>
        </StickyFormFooter>
      </div>`,
  }),
}
