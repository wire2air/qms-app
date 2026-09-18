import { ref } from 'vue'
import { IconCircleCheck, IconCircleX } from '@tabler/icons-vue'
import SegmentedControl from './SegmentedControl.vue'
import BaseField from './form/BaseField.vue'

/**
 * SegmentedControl — accessible single-choice toggle (severity, priority,
 * yes/no). WAI-ARIA radiogroup: Arrow/Home/End move + select, Space/Enter
 * select, roving tabindex. The labeled-text sibling of BaseSwitcher.
 */
export default {
  title: 'Forms/SegmentedControl',
  component: SegmentedControl,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    equalWidth: { control: 'boolean' },
    nullable: { control: 'boolean' },
    disabled: { control: 'boolean' },
    readonly: { control: 'boolean' },
  },
  args: { size: 'md', equalWidth: true, nullable: false, disabled: false, readonly: false },
}

const SEVERITY = [
  { label: 'Minor', value: 'MINOR' },
  { label: 'Major', value: 'MAJOR' },
  { label: 'Critical', value: 'CRITICAL' },
]
const PRIORITY = [
  { label: 'Low', value: 'LOW' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'High', value: 'HIGH' },
  { label: 'Critical', value: 'CRITICAL' },
]

/** Default single-select — the NC "Severity" field. */
export const Default = {
  render: (args) => ({
    components: { SegmentedControl },
    setup() {
      const model = ref('MINOR')
      return { args, model, options: SEVERITY }
    },
    template: `
      <div class="tw:max-w-md tw:flex tw:flex-col tw:gap-3">
        <SegmentedControl v-bind="args" v-model="model" :options="options" ariaLabel="Severity" />
        <p class="tw:text-xs tw:text-secondary">Selected: {{ model ?? '—' }}</p>
      </div>`,
  }),
}

/**
 * Nullable — clicking the active option clears it. This is the NC "Priority"
 * field, which is optional and starts unset.
 */
export const Nullable = {
  args: { nullable: true },
  render: (args) => ({
    components: { SegmentedControl },
    setup() {
      const model = ref(null)
      return { args, model, options: PRIORITY }
    },
    template: `
      <div class="tw:max-w-lg tw:flex tw:flex-col tw:gap-3">
        <SegmentedControl v-bind="args" v-model="model" :options="options" ariaLabel="Priority" />
        <p class="tw:text-xs tw:text-secondary">Selected: {{ model ?? '— (click the active option to clear)' }}</p>
      </div>`,
  }),
}

/** Two options with icons — a yes/no decision. */
export const YesNoWithIcons = {
  render: (args) => ({
    components: { SegmentedControl },
    setup() {
      const model = ref(true)
      const options = [
        { label: 'Yes', value: true, icon: IconCircleCheck },
        { label: 'No', value: false, icon: IconCircleX },
      ]
      return { args, model, options }
    },
    template: `
      <div class="tw:max-w-xs">
        <SegmentedControl v-bind="args" v-model="model" :options="options"
          ariaLabel="Also create a linked CAPA?" />
      </div>`,
  }),
}

/** All three sizes. */
export const Sizes = {
  render: (args) => ({
    components: { SegmentedControl },
    setup() {
      const a = ref('MAJOR')
      const b = ref('MAJOR')
      const c = ref('MAJOR')
      return { args, a, b, c, options: SEVERITY }
    },
    template: `
      <div class="tw:max-w-md tw:flex tw:flex-col tw:gap-4">
        <SegmentedControl v-bind="args" size="sm" v-model="a" :options="options" ariaLabel="Small" />
        <SegmentedControl v-bind="args" size="md" v-model="b" :options="options" ariaLabel="Medium" />
        <SegmentedControl v-bind="args" size="lg" v-model="c" :options="options" ariaLabel="Large" />
      </div>`,
  }),
}

/** Intrinsic width (equalWidth=false) — sizes to content instead of filling. */
export const IntrinsicWidth = {
  args: { equalWidth: false },
  render: (args) => ({
    components: { SegmentedControl },
    setup() {
      const model = ref('MEDIUM')
      return { args, model, options: PRIORITY }
    },
    template: `<SegmentedControl v-bind="args" v-model="model" :options="options" ariaLabel="Priority" />`,
  }),
}

/** A single disabled option alongside enabled ones (keyboard nav skips it). */
export const PerOptionDisabled = {
  render: (args) => ({
    components: { SegmentedControl },
    setup() {
      const model = ref('MINOR')
      const options = [
        { label: 'Minor', value: 'MINOR' },
        { label: 'Major', value: 'MAJOR' },
        { label: 'Critical', value: 'CRITICAL', disabled: true },
      ]
      return { args, model, options }
    },
    template: `<div class="tw:max-w-md"><SegmentedControl v-bind="args" v-model="model" :options="options" ariaLabel="Severity" /></div>`,
  }),
}

/** Whole control disabled. */
export const Disabled = {
  args: { disabled: true },
  render: Default.render,
}

/**
 * Wrapped in BaseField — the canonical form usage. BaseField supplies the
 * label, required marker, id and aria wiring; the error replaces the hint and
 * sets aria-invalid on the group.
 */
export const InFieldWithError = {
  render: () => ({
    components: { SegmentedControl, BaseField },
    setup() {
      const model = ref(null)
      return { model, options: SEVERITY }
    },
    template: `
      <div class="tw:max-w-md">
        <BaseField label="Severity" required error="Severity is required.">
          <template #default="field">
            <SegmentedControl v-bind="field" v-model="model" :options="options" />
          </template>
        </BaseField>
      </div>`,
  }),
}
