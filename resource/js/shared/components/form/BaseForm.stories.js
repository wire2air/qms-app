import { ref, computed } from 'vue'
import { IconInfoCircle, IconCategory } from '@tabler/icons-vue'
import BaseForm from './BaseForm.vue'
import FormSection from './FormSection.vue'
import BaseField from './BaseField.vue'
import BaseFieldRow from '../BaseFieldRow.vue'
import BaseTextInput from '../BaseTextInput.vue'
import SegmentedControl from '../SegmentedControl.vue'
import AutosaveIndicator from './AutosaveIndicator.vue'

/**
 * BaseForm — the orchestrator: validate → ValidationSummary + jump-to-field →
 * submit, with a sticky footer, ⌘↵, and an unsaved guard. A form is now
 * "sections + a validate()".
 */
export default {
  title: 'Forms/BaseForm',
  component: BaseForm,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}

const SEVERITY = [
  { label: 'Minor', value: 'MINOR' },
  { label: 'Major', value: 'MAJOR' },
  { label: 'Critical', value: 'CRITICAL' },
]

/**
 * Submit mode — the rebuilt NC create (lite). Press "Raise NC" with empty
 * fields: the ValidationSummary appears and clicking a row jumps to the field.
 * Fill them and it emits submit. ⌘↵ also submits.
 */
export const SubmitMode = {
  render: () => ({
    components: { BaseForm, FormSection, BaseField, BaseFieldRow, BaseTextInput, SegmentedControl },
    setup() {
      const form = ref({ title: '', severity: null, site: '' })
      const submitted = ref(0)
      const dirty = computed(() => !!form.value.title || !!form.value.severity || !!form.value.site)
      function validate() {
        const e = []
        if (!form.value.title) e.push({ id: 'nc-title', label: 'Title', message: 'Title is required.' })
        if (!form.value.severity) e.push({ id: 'nc-severity', label: 'Severity', message: 'Severity is required.' })
        if (!form.value.site) e.push({ id: 'nc-site', label: 'Site', message: 'Site is required.' })
        return e
      }
      function onSubmit() { submitted.value++ }
      return { form, dirty, validate, onSubmit, submitted, IconInfoCircle, IconCategory, SEVERITY }
    },
    template: `
      <div class="tw:h-screen tw:overflow-y-auto tw:bg-main tw:flex tw:flex-col">
        <div class="tw:flex-1 tw:max-w-2xl tw:w-full tw:mx-auto tw:p-4">
          <BaseForm :validate="validate" :dirty="dirty" submitLabel="Raise NC"
            @submit="onSubmit">
            <FormSection title="Basic information" :icon="IconInfoCircle">
              <BaseField label="Title" required id="nc-title">
                <template #default="field">
                  <BaseTextInput v-bind="field" v-model="form.title" placeholder="Describe the nonconformance…" />
                </template>
              </BaseField>
            </FormSection>
            <FormSection title="Classification" :icon="IconCategory" iconVariant="boxed" iconColor="amber">
              <BaseFieldRow :columns="2">
                <BaseField label="Severity" required id="nc-severity">
                  <template #default="field">
                    <SegmentedControl v-bind="field" v-model="form.severity" :options="SEVERITY" />
                  </template>
                </BaseField>
                <BaseField label="Site" required id="nc-site">
                  <template #default="field">
                    <BaseTextInput v-bind="field" v-model="form.site" placeholder="Site" />
                  </template>
                </BaseField>
              </BaseFieldRow>
            </FormSection>
            <p class="tw:text-xs tw:text-secondary">Submitted {{ submitted }} time(s). Try ⌘↵.</p>
          </BaseForm>
        </div>
      </div>`,
  }),
}

/**
 * Autosave mode — detail-page pattern. No submit gating; the footer carries an
 * AutosaveIndicator via #footer-status instead of a save button.
 */
export const AutosaveMode = {
  render: () => ({
    components: { BaseForm, FormSection, BaseField, BaseTextInput, AutosaveIndicator },
    setup() {
      const form = ref({ title: 'Cracked weld on bracket' })
      const saveState = ref('saved')
      return { form, saveState, IconInfoCircle }
    },
    template: `
      <div class="tw:h-screen tw:overflow-y-auto tw:bg-main tw:flex tw:flex-col">
        <div class="tw:flex-1 tw:max-w-2xl tw:w-full tw:mx-auto tw:p-4">
          <BaseForm mode="autosave" submitLabel="Done">
            <FormSection title="Details" :icon="IconInfoCircle">
              <BaseField label="Title">
                <template #default="field">
                  <BaseTextInput v-bind="field" v-model="form.title" />
                </template>
              </BaseField>
            </FormSection>
            <template #footer-status>
              <AutosaveIndicator :state="saveState" savedAtLabel="just now" />
            </template>
          </BaseForm>
        </div>
      </div>`,
  }),
}

/** A failed server save, surfaced persistently in the footer. */
export const WithServerError = {
  render: () => ({
    components: { BaseForm, FormSection, BaseField, BaseTextInput },
    setup() {
      const form = ref({ title: 'x' })
      const dirty = ref(true)
      return { form, dirty, IconInfoCircle }
    },
    template: `
      <div class="tw:h-screen tw:overflow-y-auto tw:bg-main tw:flex tw:flex-col">
        <div class="tw:flex-1 tw:max-w-2xl tw:w-full tw:mx-auto tw:p-4">
          <BaseForm :dirty="dirty" submitLabel="Raise NC"
            submitError="Could not raise NC — workflow version no longer exists.">
            <FormSection title="Basic information" :icon="IconInfoCircle">
              <BaseField label="Title" required>
                <template #default="field"><BaseTextInput v-bind="field" v-model="form.title" /></template>
              </BaseField>
            </FormSection>
          </BaseForm>
        </div>
      </div>`,
  }),
}
