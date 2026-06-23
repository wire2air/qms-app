import { ref } from 'vue'
import BaseTagsInput from './BaseTagsInput.vue'
import BaseField from './form/BaseField.vue'

/**
 * BaseTagsInput — free-text chip input for ad-hoc string lists (no entity behind
 * each value). Enter/comma adds, Backspace removes the last. v-model is string[].
 */
export default {
  title: 'Forms/BaseTagsInput',
  component: BaseTagsInput,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    disabled: { control: 'boolean' },
    allowDuplicates: { control: 'boolean' },
  },
  args: { placeholder: 'Add a keyword…', size: 'md', disabled: false, allowDuplicates: false },
  decorators: [() => ({ template: '<div class="tw:max-w-md tw:p-4 tw:bg-main"><story /></div>' })],
}

export const Default = {
  render: (args) => ({
    components: { BaseTagsInput },
    setup() {
      const tags = ref(['stainless', 'lot-44'])
      return { args, tags }
    },
    template: `
      <div class="tw:flex tw:flex-col tw:gap-2">
        <BaseTagsInput v-bind="args" v-model="tags" />
        <p class="tw:text-xs tw:text-secondary">{{ tags.length }} tag(s): {{ tags.join(', ') || '—' }}</p>
      </div>`,
  }),
}

export const Empty = {
  render: (args) => ({
    components: { BaseTagsInput },
    setup() {
      const tags = ref([])
      return { args, tags }
    },
    template: `<BaseTagsInput v-bind="args" v-model="tags" />`,
  }),
}

/** Capped at 3 tags — the input disables when full. */
export const MaxThree = {
  render: (args) => ({
    components: { BaseTagsInput },
    setup() {
      const tags = ref(['a', 'b'])
      return { args, tags }
    },
    template: `<BaseTagsInput v-bind="args" v-model="tags" :max="3" />`,
  }),
}

export const Disabled = {
  args: { disabled: true },
  render: (args) => ({
    components: { BaseTagsInput },
    setup() {
      const tags = ref(['locked', 'read-only'])
      return { args, tags }
    },
    template: `<BaseTagsInput v-bind="args" v-model="tags" />`,
  }),
}

/** In BaseField — label + hint wiring. */
export const InField = {
  render: () => ({
    components: { BaseTagsInput, BaseField },
    setup() {
      const tags = ref(['ISO-9001'])
      return { tags }
    },
    template: `
      <BaseField label="Keywords" hint="Press Enter or comma to add">
        <template #default="field">
          <BaseTagsInput v-bind="field" v-model="tags" placeholder="Add a keyword…" />
        </template>
      </BaseField>`,
  }),
}
