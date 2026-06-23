import { ref, computed } from 'vue'
import { DateTime } from 'luxon'
import {
  IconInfoCircle,
  IconCategory,
  IconBox,
  IconBell,
  IconShieldCheck,
  IconRoute,
} from '@tabler/icons-vue'
import BaseForm from './BaseForm.vue'
import FormSection from './FormSection.vue'
import FormProgressNav from './FormProgressNav.vue'
import BaseFieldRow from '../BaseFieldRow.vue'
import BaseField from './BaseField.vue'
import BaseTextInput from '../BaseTextInput.vue'
import BaseTextarea from '../BaseTextarea.vue'
import BaseDateField from '../BaseDateField.vue'
import BaseInlineSelect from '../BaseInlineSelect.vue'
import BaseSwitch from '../BaseSwitch.vue'
import SegmentedControl from '../SegmentedControl.vue'
import BaseTagsInput from '../BaseTagsInput.vue'
import BaseAutocomplete from '../BaseAutocomplete.vue'
import BaseCheckbox from '../BaseCheckbox.vue'
import BaseOptionGroup from '../BaseOptionGroup.vue'
import BaseColorPicker from '../BaseColorPicker.vue'
import BaseOtpInput from '../BaseOtpInput.vue'
import BaseSignaturePad from '../BaseSignaturePad.vue'
import BaseChecklist from '../BaseChecklist.vue'

/**
 * A complete reference form page assembled from the whole form system —
 * BaseForm + FormProgressNav + 6 FormSections + every input type + the full
 * validation pipeline + sticky footer. This is the migration target for
 * NonconformancesCreate.vue and the copy-paste template for new forms.
 */
export default {
  title: 'Templates/Form Page',
  parameters: { layout: 'fullscreen' },
}

const SITES = [
  { id: 'plant-1', name: 'Plant 1 — Detroit' },
  { id: 'plant-2', name: 'Plant 2 — Austin' },
]
const DEPARTMENTS = [
  { id: 'fab', name: 'Fabrication' },
  { id: 'assembly', name: 'Assembly' },
  { id: 'qc', name: 'Quality Control' },
]
const NC_TYPES = [
  { id: 'process', name: 'Process' },
  { id: 'product', name: 'Product' },
  { id: 'audit', name: 'Audit finding' },
]
const SOURCES = [
  { id: 'internal', name: 'Internal' },
  { id: 'customer', name: 'Customer' },
  { id: 'supplier', name: 'Supplier' },
  { id: 'audit', name: 'Audit' },
]
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
const PEOPLE = [
  { value: 'u1', label: 'Dana Reed' },
  { value: 'u2', label: 'Marco Silva' },
  { value: 'u3', label: 'Priya Nair' },
  { value: 'u4', label: 'Tom Becker' },
]
const PRODUCTS = [
  { value: 'p1', label: 'Bracket A-100' },
  { value: 'p2', label: 'Housing B-220' },
  { value: 'p3', label: 'Gasket C-330' },
]
const SUPPLIERS = [
  { id: 's1', name: 'Acme Metals' },
  { id: 's2', name: 'Northwind Plastics' },
]
const UNITS = [
  { value: 'ea', label: 'Each' },
  { value: 'box', label: 'Box' },
  { value: 'sheet', label: 'Sheet' },
  { value: 'kg', label: 'Kilogram' },
]
const WORKFLOWS = [
  { id: 'wf-std', name: 'Standard NC (3-step)' },
  { id: 'wf-8d', name: '8D CAPA' },
]

export const RaiseNonconformance = {
  render: () => ({
    components: {
      BaseForm, FormSection, FormProgressNav, BaseFieldRow, BaseField,
      BaseTextInput, BaseTextarea, BaseDateField, BaseInlineSelect, BaseSwitch,
      SegmentedControl, BaseTagsInput, BaseAutocomplete,
    },
    setup() {
      const form = ref({
        title: '', description: '', keywords: [],
        siteId: null, departmentId: null, typeId: null, sourceId: null,
        severity: null, priority: null,
        detectedAt: DateTime.now(), dueDate: null, ownerId: null,
        productId: null, supplierId: null, supplierFacing: false,
        qty: null, uom: null, po: '', order: '', lot: '',
        notify: [], containment: '',
        workflowId: null,
      })

      const saving = ref(false)
      const submitError = ref('')
      const submittedAt = ref('')

      function validate() {
        const e = []
        const need = (cond, id, label, message) => { if (cond) e.push({ id, label, message }) }
        need(!form.value.title, 'f-title', 'Title', 'Title is required.')
        need(!form.value.siteId, 'f-site', 'Site', 'Site is required.')
        need(!form.value.departmentId, 'f-department', 'Department', 'Department is required.')
        need(!form.value.typeId, 'f-type', 'NC type', 'NC type is required.')
        need(!form.value.sourceId, 'f-source', 'Detection source', 'Detection source is required.')
        need(!form.value.severity, 'f-severity', 'Severity', 'Severity is required.')
        need(!form.value.detectedAt, 'f-detected', 'Detected date', 'Detected date is required.')
        need(!form.value.ownerId, 'f-owner', 'Responsible party', 'Responsible party is required.')
        need(form.value.supplierFacing && !form.value.supplierId, 'f-supplier', 'Supplier', 'Pick a supplier for a supplier-facing NC.')
        need(!form.value.workflowId, 'f-workflow', 'Workflow', 'Workflow is required.')
        return e
      }

      const classificationDone = computed(() =>
        form.value.siteId && form.value.departmentId && form.value.typeId &&
        form.value.sourceId && form.value.severity && form.value.detectedAt && form.value.ownerId,
      )
      const navSections = computed(() => [
        { id: 'basic', label: 'Basic', icon: IconInfoCircle, status: form.value.title ? 'complete' : null },
        { id: 'classification', label: 'Classification', icon: IconCategory, status: classificationDone.value ? 'complete' : null },
        { id: 'product', label: 'Product', icon: IconBox, status: null },
        { id: 'notify', label: 'Notify', icon: IconBell, status: null },
        { id: 'containment', label: 'Containment', icon: IconShieldCheck, status: null },
        { id: 'workflow', label: 'Workflow', icon: IconRoute, status: form.value.workflowId ? 'complete' : null },
      ])

      const dirty = computed(() =>
        Object.entries(form.value).some(([k, v]) => {
          if (k === 'detectedAt') return false
          if (Array.isArray(v)) return v.length > 0
          return v !== null && v !== '' && v !== false
        }),
      )

      function onSubmit() {
        saving.value = true
        submitError.value = ''
        // Simulated save: succeeds unless title is literally "fail".
        window.setTimeout(() => {
          saving.value = false
          if (form.value.title.trim().toLowerCase() === 'fail') {
            submitError.value = 'Could not raise NC — workflow version no longer exists.'
            return
          }
          submittedAt.value = DateTime.now().toFormat('t')
        }, 1000)
      }

      return {
        form, validate, navSections, dirty, saving, submitError, submittedAt,
        onSubmit, SITES, DEPARTMENTS, NC_TYPES, SOURCES, SEVERITY, PRIORITY,
        PEOPLE, PRODUCTS, SUPPLIERS, UNITS, WORKFLOWS,
        IconInfoCircle, IconCategory, IconBox, IconBell, IconShieldCheck, IconRoute,
      }
    },
    template: `
      <div class="tw:h-screen tw:overflow-y-auto tw:bg-main tw:flex tw:flex-col">
        <!-- Sticky page header + section nav -->
        <div class="tw:sticky tw:top-0 tw:z-20 tw:bg-main tw:border-b tw:border-divider">
          <div class="tw:max-w-3xl tw:mx-auto tw:w-full tw:px-4 tw:pt-4 tw:pb-2 tw:flex tw:items-center tw:justify-between">
            <h1 class="tw:text-xl tw:font-bold tw:text-on-main">Raise nonconformance</h1>
            <span v-if="submittedAt" class="tw:text-sm tw:text-good">✓ Raised at {{ submittedAt }}</span>
          </div>
          <div class="tw:max-w-3xl tw:mx-auto tw:w-full tw:px-4">
            <FormProgressNav :sections="navSections" />
          </div>
        </div>

        <!-- Body -->
        <div class="tw:max-w-3xl tw:mx-auto tw:w-full tw:px-4 tw:py-6 tw:flex-1">
          <BaseForm
            :validate="validate" :dirty="dirty" :loading="saving" :submitError="submitError"
            submitLabel="Raise NC" @submit="onSubmit"
          >
            <!-- 1. Basic information -->
            <FormSection id="basic" title="Basic information" :icon="IconInfoCircle">
              <div class="tw:flex tw:flex-col tw:gap-4">
                <BaseField label="Title" required id="f-title">
                  <template #default="field">
                    <BaseTextInput v-bind="field" v-model="form.title" placeholder="Describe the nonconformance…" />
                  </template>
                </BaseField>
                <BaseField label="Description" hint="What happened, where, and how it was found.">
                  <template #default="field">
                    <BaseTextarea v-bind="field" v-model="form.description" autosize :rows="3" placeholder="Provide details…" />
                  </template>
                </BaseField>
                <BaseField label="Keywords" optional hint="Press Enter or comma to add">
                  <template #default="field">
                    <BaseTagsInput v-bind="field" v-model="form.keywords" placeholder="Add a keyword…" />
                  </template>
                </BaseField>
              </div>
            </FormSection>

            <!-- 2. Classification -->
            <FormSection id="classification" title="Classification" :icon="IconCategory" iconVariant="boxed" iconColor="amber">
              <BaseFieldRow :columns="2">
                <BaseField label="Site" required id="f-site">
                  <template #default="field"><BaseInlineSelect v-bind="field" v-model="form.siteId" :items="SITES" required /></template>
                </BaseField>
                <BaseField label="Department" required id="f-department">
                  <template #default="field"><BaseInlineSelect v-bind="field" v-model="form.departmentId" :items="DEPARTMENTS" required /></template>
                </BaseField>
                <BaseField label="NC type" required id="f-type">
                  <template #default="field"><BaseInlineSelect v-bind="field" v-model="form.typeId" :items="NC_TYPES" required /></template>
                </BaseField>
                <BaseField label="Detection source" required id="f-source">
                  <template #default="field"><BaseInlineSelect v-bind="field" v-model="form.sourceId" :items="SOURCES" required /></template>
                </BaseField>
                <BaseField label="Severity" required id="f-severity">
                  <template #default="field"><SegmentedControl v-bind="field" v-model="form.severity" :options="SEVERITY" /></template>
                </BaseField>
                <BaseField label="Priority" optional>
                  <template #default="field"><SegmentedControl v-bind="field" v-model="form.priority" :options="PRIORITY" nullable /></template>
                </BaseField>
                <BaseField label="Detected date" required id="f-detected">
                  <template #default="field"><BaseDateField v-bind="field" v-model="form.detectedAt" mode="date" /></template>
                </BaseField>
                <BaseField label="Due date" optional>
                  <template #default="field"><BaseDateField v-bind="field" v-model="form.dueDate" mode="date" /></template>
                </BaseField>
                <BaseField label="Responsible party" required id="f-owner" hint="Drives the NC to closure.">
                  <template #default="field"><BaseAutocomplete v-bind="field" v-model="form.ownerId" :options="PEOPLE" placeholder="Search people…" /></template>
                </BaseField>
              </BaseFieldRow>
            </FormSection>

            <!-- 3. Product & material (optional, collapsible) -->
            <FormSection id="product" title="Product & material" optional collapsible :defaultOpen="false" :icon="IconBox" iconVariant="boxed" iconColor="blue">
              <BaseFieldRow :columns="2">
                <BaseField label="Product">
                  <template #default="field"><BaseAutocomplete v-bind="field" v-model="form.productId" :options="PRODUCTS" placeholder="Search products…" /></template>
                </BaseField>
                <BaseField label="Supplier" :required="form.supplierFacing" id="f-supplier">
                  <template #default="field"><BaseInlineSelect v-bind="field" v-model="form.supplierId" :items="SUPPLIERS" /></template>
                </BaseField>
                <BaseField label="Qty affected">
                  <template #default="field"><BaseTextInput v-bind="field" v-model="form.qty" type="number" placeholder="0" /></template>
                </BaseField>
                <BaseField label="Unit of measure">
                  <template #default="field"><BaseAutocomplete v-bind="field" v-model="form.uom" :options="UNITS" placeholder="Unit…" /></template>
                </BaseField>
                <BaseField label="PO #">
                  <template #default="field"><BaseTextInput v-bind="field" v-model="form.po" placeholder="Purchase order number" /></template>
                </BaseField>
                <BaseField label="Order #">
                  <template #default="field"><BaseTextInput v-bind="field" v-model="form.order" placeholder="Customer / sales order" /></template>
                </BaseField>
              </BaseFieldRow>
              <div class="tw:mt-4">
                <BaseSwitch v-model="form.supplierFacing" label="Supplier-facing NC" />
              </div>
            </FormSection>

            <!-- 4. Notify (optional, collapsible) -->
            <FormSection id="notify" title="Notify (cc)" optional collapsible :defaultOpen="false" :icon="IconBell">
              <BaseField label="Notify people" hint="Notified on create and status changes. No task is created.">
                <template #default="field"><BaseTagsInput v-bind="field" v-model="form.notify" placeholder="Add an email…" /></template>
              </BaseField>
            </FormSection>

            <!-- 5. Immediate containment (optional, collapsible) -->
            <FormSection id="containment" title="Immediate containment action" optional collapsible :defaultOpen="false" :icon="IconShieldCheck">
              <BaseField label="Containment">
                <template #default="field"><BaseTextarea v-bind="field" v-model="form.containment" autosize :rows="3" placeholder="Describe actions taken at detection…" /></template>
              </BaseField>
            </FormSection>

            <!-- 6. Workflow -->
            <FormSection id="workflow" title="Workflow" :icon="IconRoute">
              <BaseField label="Workflow" required id="f-workflow" hint="Determines the review/approval path.">
                <template #default="field"><BaseInlineSelect v-bind="field" v-model="form.workflowId" :items="WORKFLOWS" required /></template>
              </BaseField>
            </FormSection>

            <p class="tw:text-xs tw:text-secondary">Tip: ⌘↵ submits. Type “fail” as the title to see a server error.</p>
          </BaseForm>
        </div>
      </div>`,
  }),
}

/**
 * All field types — a kitchen-sink page exercising EVERY input the form system
 * supports, grouped by category, inside one BaseForm. Use this to eyeball every
 * control at once. (File upload uses BaseUploader; rich-text and photo/camera
 * inputs are demoed in their own stories — they need backend/permissions.)
 */
export const AllFieldTypes = {
  render: () => ({
    components: {
      BaseForm, FormSection, BaseFieldRow, BaseField,
      BaseTextInput, BaseTextarea, BaseDateField, BaseInlineSelect, BaseSwitch,
      SegmentedControl, BaseTagsInput, BaseAutocomplete, BaseCheckbox,
      BaseOptionGroup, BaseColorPicker, BaseOtpInput, BaseSignaturePad, BaseChecklist,
    },
    setup() {
      const f = ref({
        text: '', email: '', password: '', number: null, url: '', textarea: '',
        single: null, multi: [], autocomplete: null, async: null, tags: ['ISO-9001'],
        severity: 'MINOR', priority: null, radio: 'use', checks: ['safety'],
        checkbox: true, switch: false,
        date: DateTime.now(), datetime: null, time: null, range: null,
        color: '#2563eb', otp: '', signature: '', checklist: [],
      })
      function asyncLoader(q) {
        return new Promise((resolve) => {
          window.setTimeout(() => {
            resolve(PEOPLE.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())))
          }, 400)
        })
      }
      const DISPOSITION = [
        { label: 'Use as-is', value: 'use' },
        { label: 'Rework', value: 'rework' },
        { label: 'Scrap', value: 'scrap' },
      ]
      const STANDARDS = [
        { label: 'Safety', value: 'safety' },
        { label: 'Compliance', value: 'compliance' },
        { label: 'Quality', value: 'quality' },
      ]
      const CHECK_ROWS = [
        { label: 'Surface finish', value: 'surface' },
        { label: 'Dimensions', value: 'dims' },
      ]
      const CHECK_COLS = [
        { label: 'Pass', value: 'pass', inputType: 'radio' },
        { label: 'Fail', value: 'fail', inputType: 'radio' },
        { label: 'N/A', value: 'na', inputType: 'radio' },
      ]
      return {
        f, asyncLoader, DISPOSITION, STANDARDS, CHECK_ROWS, CHECK_COLS,
        SITES, DEPARTMENTS, SEVERITY, PRIORITY, PEOPLE, UNITS,
        IconInfoCircle, IconCategory, IconBox, IconBell, IconShieldCheck,
      }
    },
    template: `
      <div class="tw:h-screen tw:overflow-y-auto tw:bg-main tw:flex tw:flex-col">
        <div class="tw:sticky tw:top-0 tw:z-20 tw:bg-main tw:border-b tw:border-divider">
          <div class="tw:max-w-3xl tw:mx-auto tw:w-full tw:px-4 tw:py-4">
            <h1 class="tw:text-xl tw:font-bold tw:text-on-main">All field types</h1>
          </div>
        </div>
        <div class="tw:max-w-3xl tw:mx-auto tw:w-full tw:px-4 tw:py-6 tw:flex-1">
          <BaseForm submitLabel="Save" :dirty="true">

            <FormSection id="s-text" title="Text & numeric" :icon="IconInfoCircle">
              <BaseFieldRow :columns="2">
                <BaseField label="Text"><template #default="p"><BaseTextInput v-bind="p" v-model="f.text" placeholder="Plain text" /></template></BaseField>
                <BaseField label="Email"><template #default="p"><BaseTextInput v-bind="p" v-model="f.email" type="email" placeholder="name@company.com" /></template></BaseField>
                <BaseField label="Password"><template #default="p"><BaseTextInput v-bind="p" v-model="f.password" type="password" placeholder="••••••••" /></template></BaseField>
                <BaseField label="Number"><template #default="p"><BaseTextInput v-bind="p" v-model="f.number" type="number" placeholder="0" /></template></BaseField>
                <BaseField label="URL"><template #default="p"><BaseTextInput v-bind="p" v-model="f.url" type="url" placeholder="https://" /></template></BaseField>
              </BaseFieldRow>
              <div class="tw:mt-4">
                <BaseField label="Textarea" hint="Auto-grows as you type"><template #default="p"><BaseTextarea v-bind="p" v-model="f.textarea" autosize :rows="3" placeholder="Multi-line text…" /></template></BaseField>
              </div>
            </FormSection>

            <FormSection id="s-select" title="Selection & search" :icon="IconCategory" iconVariant="boxed" iconColor="blue">
              <BaseFieldRow :columns="2">
                <BaseField label="Single select"><template #default="p"><BaseInlineSelect v-bind="p" v-model="f.single" :items="SITES" /></template></BaseField>
                <BaseField label="Multi select"><template #default="p"><BaseInlineSelect v-bind="p" v-model="f.multi" :items="DEPARTMENTS" multiple /></template></BaseField>
                <BaseField label="Autocomplete (static)"><template #default="p"><BaseAutocomplete v-bind="p" v-model="f.autocomplete" :options="UNITS" placeholder="Unit…" /></template></BaseField>
                <BaseField label="Async search"><template #default="p"><BaseAutocomplete v-bind="p" v-model="f.async" :loader="asyncLoader" placeholder="Search people…" /></template></BaseField>
              </BaseFieldRow>
              <div class="tw:mt-4">
                <BaseField label="Tags" hint="Enter or comma to add"><template #default="p"><BaseTagsInput v-bind="p" v-model="f.tags" placeholder="Add a tag…" /></template></BaseField>
              </div>
            </FormSection>

            <FormSection id="s-choice" title="Choice & toggles" :icon="IconShieldCheck">
              <BaseFieldRow :columns="2">
                <BaseField label="Segmented (single)" required><template #default="p"><SegmentedControl v-bind="p" v-model="f.severity" :options="SEVERITY" /></template></BaseField>
                <BaseField label="Segmented (nullable)" optional><template #default="p"><SegmentedControl v-bind="p" v-model="f.priority" :options="PRIORITY" nullable /></template></BaseField>
              </BaseFieldRow>
              <div class="tw:mt-4 tw:flex tw:flex-col tw:gap-4">
                <BaseOptionGroup v-model="f.radio" label="Radio group (disposition)" :options="DISPOSITION" type="radio" inline />
                <BaseOptionGroup v-model="f.checks" label="Checkbox group (standards)" :options="STANDARDS" type="checkbox" inline />
                <div class="tw:flex tw:items-center tw:gap-6">
                  <BaseCheckbox v-model="f.checkbox" label="Single checkbox" />
                  <BaseSwitch v-model="f.switch" label="Switch" />
                </div>
              </div>
            </FormSection>

            <FormSection id="s-date" title="Date & time" :icon="IconBell">
              <BaseFieldRow :columns="2">
                <BaseField label="Date"><template #default="p"><BaseDateField v-bind="p" v-model="f.date" mode="date" /></template></BaseField>
                <BaseField label="Date & time"><template #default="p"><BaseDateField v-bind="p" v-model="f.datetime" mode="datetime" /></template></BaseField>
                <BaseField label="Time"><template #default="p"><BaseDateField v-bind="p" v-model="f.time" mode="time" /></template></BaseField>
                <BaseField label="Date range"><template #default="p"><BaseDateField v-bind="p" v-model="f.range" mode="range" /></template></BaseField>
              </BaseFieldRow>
            </FormSection>

            <FormSection id="s-special" title="Specialized" :icon="IconBox" iconVariant="boxed" iconColor="purple">
              <BaseFieldRow :columns="2">
                <BaseField label="Color"><template #default="p"><BaseColorPicker v-bind="p" v-model="f.color" /></template></BaseField>
                <BaseField label="One-time code"><template #default="p"><BaseOtpInput v-bind="p" v-model="f.otp" :length="6" /></template></BaseField>
              </BaseFieldRow>
              <div class="tw:mt-4 tw:flex tw:flex-col tw:gap-4">
                <BaseChecklist v-model="f.checklist" label="Checklist (matrix)" :rows="CHECK_ROWS" :columns="CHECK_COLS" />
                <BaseField label="Signature"><template #default="p"><BaseSignaturePad v-bind="p" v-model="f.signature" /></template></BaseField>
              </div>
            </FormSection>

          </BaseForm>
        </div>
      </div>`,
  }),
}
