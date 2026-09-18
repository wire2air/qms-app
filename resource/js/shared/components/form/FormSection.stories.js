import { ref } from 'vue'
import { IconInfoCircle, IconCategory, IconBox } from '@tabler/icons-vue'
import FormSection from './FormSection.vue'
import BaseField from './BaseField.vue'
import BaseFieldRow from '../BaseFieldRow.vue'
import BaseTextInput from '../BaseTextInput.vue'
import SegmentedControl from '../SegmentedControl.vue'

/**
 * FormSection — one definition of a titled form section (BaseCard +
 * BaseSectionHeader). Replaces the copy-pasted card chrome on every form, adds
 * declarative `optional` + `collapsible`, and carries the anchor `id` used by
 * FormProgressNav.
 */
export default {
  title: 'Forms/FormSection',
  component: FormSection,
  tags: ['autodocs'],
  argTypes: {
    iconVariant: { control: 'inline-radio', options: ['plain', 'boxed'] },
    iconColor: {
      control: 'select',
      options: ['primary', 'blue', 'green', 'amber', 'red', 'purple', 'gray'],
    },
    padding: { control: 'inline-radio', options: ['none', 'sm', 'md', 'lg'] },
    optional: { control: 'boolean' },
    collapsible: { control: 'boolean' },
    defaultOpen: { control: 'boolean' },
  },
  args: {
    title: 'Basic information',
    iconVariant: 'plain',
    iconColor: 'primary',
    padding: 'md',
    optional: false,
    collapsible: false,
    defaultOpen: true,
  },
  decorators: [
    () => ({ template: '<div class="tw:max-w-2xl tw:p-4 tw:bg-main"><story /></div>' }),
  ],
}

/** Default — title + icon header over a stacked field body. */
export const Default = {
  render: (args) => ({
    components: { FormSection, BaseField, BaseTextInput },
    setup() {
      const title = ref('')
      return { args, title, IconInfoCircle }
    },
    template: `
      <FormSection v-bind="args" :icon="IconInfoCircle">
        <BaseField label="Title" required>
          <template #default="field">
            <BaseTextInput v-bind="field" v-model="title" placeholder="Describe the nonconformance…" />
          </template>
        </BaseField>
      </FormSection>`,
  }),
}

/** With a description subtitle under the title. */
export const WithDescription = {
  args: { title: 'Responsible party', description: 'Drives the record to closure.' },
  render: Default.render,
}

/** Optional marker — replaces the "(optional)" that used to be typed into headers. */
export const Optional = {
  args: { title: 'Product & material', optional: true },
  render: (args) => ({
    components: { FormSection, BaseFieldRow, BaseField, BaseTextInput },
    setup() {
      const po = ref('')
      const order = ref('')
      return { args, po, order, IconBox }
    },
    template: `
      <FormSection v-bind="args" :icon="IconBox">
        <BaseFieldRow :columns="2">
          <BaseField label="PO #">
            <template #default="field"><BaseTextInput v-bind="field" v-model="po" placeholder="Purchase order number" /></template>
          </BaseField>
          <BaseField label="Order #">
            <template #default="field"><BaseTextInput v-bind="field" v-model="order" placeholder="Customer / sales order" /></template>
          </BaseField>
        </BaseFieldRow>
      </FormSection>`,
  }),
}

/** Collapsible — optional/advanced sections fold away; collapsed content stays mounted. */
export const Collapsible = {
  args: { title: 'Product & material', optional: true, collapsible: true, defaultOpen: false },
  render: Optional.render,
}

/** Header actions slot (e.g. a per-section "Clear" button). */
export const WithActions = {
  render: (args) => ({
    components: { FormSection, BaseField, BaseTextInput },
    setup() {
      const v = ref('')
      return { args, v, IconInfoCircle }
    },
    template: `
      <FormSection v-bind="args" :icon="IconInfoCircle" iconVariant="boxed">
        <template #actions>
          <button class="tw:text-xs tw:font-medium tw:text-primary tw:hover:underline">Clear</button>
        </template>
        <BaseField label="Title">
          <template #default="field"><BaseTextInput v-bind="field" v-model="v" /></template>
        </BaseField>
      </FormSection>`,
  }),
}

/**
 * Classification rebuilt — the real NC "Classification" section assembled from
 * FormSection + BaseFieldRow + BaseField + SegmentedControl. This is the target
 * pattern the migration produces (vs. the hand-rolled grid + button groups).
 */
export const ClassificationRebuilt = {
  args: { title: 'Classification' },
  render: (args) => ({
    components: { FormSection, BaseFieldRow, BaseField, SegmentedControl },
    setup() {
      const severity = ref('MINOR')
      const priority = ref(null)
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
      return { args, severity, priority, SEVERITY, PRIORITY, IconCategory }
    },
    template: `
      <FormSection v-bind="args" :icon="IconCategory" iconVariant="boxed" iconColor="amber">
        <BaseFieldRow :columns="2">
          <BaseField label="Severity" required>
            <template #default="field">
              <SegmentedControl v-bind="field" v-model="severity" :options="SEVERITY" />
            </template>
          </BaseField>
          <BaseField label="Priority" optional>
            <template #default="field">
              <SegmentedControl v-bind="field" v-model="priority" :options="PRIORITY" nullable />
            </template>
          </BaseField>
        </BaseFieldRow>
      </FormSection>`,
  }),
}
