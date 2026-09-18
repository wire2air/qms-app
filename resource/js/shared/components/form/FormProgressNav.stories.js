import { ref } from 'vue'
import FormProgressNav from './FormProgressNav.vue'
import FormSection from './FormSection.vue'
import BaseField from './BaseField.vue'
import BaseTextInput from '../BaseTextInput.vue'

/**
 * FormProgressNav — sticky section strip for long forms: completion status per
 * section + scroll-spy. The form analog of DetailAnchorNav.
 */
export default {
  title: 'Forms/FormProgressNav',
  component: FormProgressNav,
  tags: ['autodocs'],
}

const SECTIONS = [
  { id: 'basic', label: 'Basic', status: 'complete' },
  { id: 'classification', label: 'Classification', status: 'error' },
  { id: 'product', label: 'Product', status: null },
  { id: 'workflow', label: 'Workflow', status: null },
]

/** Static strip — complete (check), error (alert), pending (dot). */
export const Default = {
  render: () => ({
    components: { FormProgressNav },
    setup: () => ({ sections: SECTIONS, activeId: 'classification' }),
    template: `<div class="tw:max-w-2xl tw:p-4 tw:bg-main"><FormProgressNav :sections="sections" :activeId="activeId" :spy="false" /></div>`,
  }),
}

/** All complete. */
export const AllComplete = {
  render: () => ({
    components: { FormProgressNav },
    setup: () => ({
      sections: SECTIONS.map((s) => ({ ...s, status: 'complete' })),
      activeId: 'workflow',
    }),
    template: `<div class="tw:max-w-2xl tw:p-4 tw:bg-main"><FormProgressNav :sections="sections" :activeId="activeId" :spy="false" /></div>`,
  }),
}

/**
 * Live scroll-spy — the nav sticks at the top and highlights the section in
 * view as you scroll. Clicking a tab scrolls to (and focuses) its section.
 */
export const ScrollSpy = {
  render: () => ({
    components: { FormProgressNav, FormSection, BaseField, BaseTextInput },
    setup() {
      const sections = ref([
        { id: 'basic', label: 'Basic', status: 'complete' },
        { id: 'classification', label: 'Classification', status: 'error' },
        { id: 'product', label: 'Product', status: null },
        { id: 'workflow', label: 'Workflow', status: null },
      ])
      const v = ref('')
      return { sections, v }
    },
    template: `
      <div class="tw:h-screen tw:overflow-y-auto tw:bg-main">
        <div class="tw:sticky tw:top-0 tw:z-10 tw:bg-main tw:px-4">
          <div class="tw:max-w-2xl tw:mx-auto">
            <FormProgressNav :sections="sections" />
          </div>
        </div>
        <div class="tw:max-w-2xl tw:mx-auto tw:p-4 tw:flex tw:flex-col tw:gap-4">
          <FormSection v-for="s in sections" :key="s.id" :id="s.id" :title="s.label">
            <div class="tw:flex tw:flex-col tw:gap-3">
              <BaseField v-for="n in 4" :key="n" :label="s.label + ' field ' + n">
                <template #default="field"><BaseTextInput v-bind="field" v-model="v" /></template>
              </BaseField>
            </div>
          </FormSection>
          <div class="tw:h-40"></div>
        </div>
      </div>`,
  }),
}
