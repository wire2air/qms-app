import { ref, nextTick } from 'vue'
import ValidationSummary from './ValidationSummary.vue'
import BaseField from './BaseField.vue'
import BaseTextInput from '../BaseTextInput.vue'

/**
 * ValidationSummary — one focusable list of all form errors on a failed submit.
 * Each row jumps to its field. Replaces firing N sequential toasts.
 */
export default {
  title: 'Forms/ValidationSummary',
  component: ValidationSummary,
  tags: ['autodocs'],
  decorators: [
    () => ({ template: '<div class="tw:max-w-2xl tw:p-4 tw:bg-main"><story /></div>' }),
  ],
}

const NC_ERRORS = [
  { id: 'nc-title', label: 'Title', message: 'Title is required.' },
  { id: 'nc-severity', label: 'Severity', message: 'Severity is required.' },
  { id: 'nc-site', label: 'Site', message: 'Site is required.' },
  { id: 'nc-owner', label: 'Responsible party', message: 'Responsible party is required.' },
]

/** The real NC submit failure — four required fields, one focusable digest. */
export const Default = {
  render: () => ({
    components: { ValidationSummary },
    setup() {
      return { errors: NC_ERRORS }
    },
    template: `<ValidationSummary :errors="errors" />`,
  }),
}

/** A single error — copy reads "1 issue". */
export const SingleError = {
  render: () => ({
    components: { ValidationSummary },
    setup() {
      return { errors: [{ id: 'nc-title', label: 'Title', message: 'Title is required.' }] }
    },
    template: `<ValidationSummary :errors="errors" />`,
  }),
}

/** Custom heading. */
export const CustomTitle = {
  render: () => ({
    components: { ValidationSummary },
    setup() {
      return { errors: NC_ERRORS }
    },
    template: `<ValidationSummary :errors="errors" title="This nonconformance can't be raised yet" />`,
  }),
}

/** No errors → renders nothing (v-if guard). */
export const Empty = {
  render: () => ({
    components: { ValidationSummary },
    setup() {
      return { errors: [] }
    },
    template: `
      <div>
        <ValidationSummary :errors="errors" />
        <p class="tw:text-xs tw:text-secondary">(No errors — the summary renders nothing.)</p>
      </div>`,
  }),
}

/**
 * Interactive — clicking an error row focuses the matching field below. This is
 * the jump-to-field wiring a form provides via @jump.
 */
export const JumpToField = {
  render: () => ({
    components: { ValidationSummary, BaseField, BaseTextInput },
    setup() {
      const summaryRef = ref(null)
      const title = ref('')
      const lot = ref('')
      const errors = [
        { id: 'demo-title', label: 'Title', message: 'Title is required.' },
        { id: 'demo-lot', label: 'Lot #', message: 'Lot number is invalid.' },
      ]
      function jump(id) {
        const el = document.getElementById(id)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus({ preventScroll: true })
      }
      // Demonstrate programmatic focus of the summary on mount.
      nextTick(() => summaryRef.value?.focus())
      return { summaryRef, errors, title, lot, jump }
    },
    template: `
      <div class="tw:flex tw:flex-col tw:gap-4">
        <ValidationSummary ref="summaryRef" :errors="errors" @jump="jump" />
        <BaseField label="Title" required error="Title is required." id="demo-title">
          <template #default="field"><BaseTextInput v-bind="field" v-model="title" placeholder="Click 'Title' above to focus me" /></template>
        </BaseField>
        <BaseField label="Lot #" error="Lot number is invalid." id="demo-lot">
          <template #default="field"><BaseTextInput v-bind="field" v-model="lot" placeholder="Click 'Lot #' above to focus me" /></template>
        </BaseField>
      </div>`,
  }),
}
