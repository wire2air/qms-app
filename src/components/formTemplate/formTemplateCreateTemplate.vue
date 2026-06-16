<script setup>
import {
  IconX,
  IconCirclePlus,
  IconFileDescription,
  IconArrowLeft,
  IconArrowRight,
  IconBrush,
  IconCheck,
  IconCircleX,
} from '@tabler/icons-vue'
import { required, helpers } from '@vuelidate/validators'
import { useValidator } from '@shared/composables/validator.js'
import { useDebounceFn } from '@vueuse/core'
import { put } from '@/api'
import { QMS_TEMPLATES } from '@/constants/formTemplates'

const props = defineProps({
  /**
   * Pre-classify the new template for an Inspections & Logs flow.
   *   - 'OPERATIONAL_LOG' — routine field log, auto-locks 15 min after
   *     submit, no esig, no review by default.
   *   - 'CONTROLLED_RECORD' — regulated record, esig required at submit,
   *     review required, edits only allowed UNTIL_REVIEW.
   * When set, the resulting template.config carries the matching
   * classification + sane edit/signature defaults so floor users get
   * the right behavior with zero extra configuration. Admin can still
   * fine-tune on the template detail page afterwards.
   */
  defaultClassification: {
    type: String,
    default: null,
    validator: (v) => v === null || ['OPERATIONAL_LOG', 'CONTROLLED_RECORD'].includes(v),
  },
})

const emit = defineEmits(['next', 'cancel'])

const open = defineModel({
  type: Boolean,
  default: false,
})

/**
 * Build the I&L config payload baked onto template.config when the
 * dialog is opened with `defaultClassification` set. Matches the shape
 * read by FieldRecordsList / AddRecordDialog / fieldRecordService.
 */
function classificationConfigDefaults(cls) {
  if (cls === 'OPERATIONAL_LOG') {
    return {
      recordClassification: 'OPERATIONAL_LOG',
      editWindow: { mode: 'TIME_WINDOW', durationMinutes: 15 },
      signature: { requiredAtSubmission: false },
      review: { required: false },
    }
  }
  if (cls === 'CONTROLLED_RECORD') {
    return {
      recordClassification: 'CONTROLLED_RECORD',
      editWindow: { mode: 'UNTIL_REVIEW' },
      signature: { requiredAtSubmission: true },
      review: { required: true },
    }
  }
  return null
}

const templateForm = reactive({
  title: '',
  code: '',
  documentTypeId: null,
  status: 'DRAFT',
  trainingRequired: false,
  retrainingOnRevision: false,
  selectedSites: [],
  schema: [],
  isAvailable: null,
  isChecking: false,
  isSubmitting: false,
  isValid: computed(() => {
    const titleValid = templateForm.title.trim().length > 0
    const codeValid = /^[a-z0-9-_]+$/i.test(templateForm.code.trim())
    // I&L log books skip the manual Document Type pick; the watch
    // below stamps INSPECTION_LOG so the field is always populated.
    const documentTypeValid =
      props.defaultClassification !== null || templateForm.documentTypeId !== null
    return titleValid && codeValid && documentTypeValid && templateForm.code.trim().length >= 2
  }),
})

const isCodeChangeFromTitle = ref(false)

// Auto-stamped DocumentType for the I&L flow. The taxonomy of
// SOP / POLICY / CAPA / NC / AUDIT carries no meaning for routine
// logs, so we hide the field and pin it to a catch-all type seeded
// by migration 20260628000800.
const INSPECTION_LOG_DOC_TYPE_ID = 'INSPECTION_LOG'

const templateRules = computed(() => ({
  title: { required: helpers.withMessage('Required', required) },
  // Document Type only matters for controlled-document forms; I&L
  // log books get the field hidden and auto-stamped below.
  ...(props.defaultClassification
    ? {}
    : { documentTypeId: { required: helpers.withMessage('Required', required) } }),
  code: { required: helpers.withMessage('Required', required) },
}))

const templateValidator = useValidator(templateRules, templateForm)

const step = ref(1)
const selectedPreset = ref(null)

async function checkTemplateCode(isNameCheck = false) {
  const code = templateForm.code.trim()
  const title = templateForm.title.trim()

  if (isNameCheck && !title) {
    templateForm.isAvailable = null
    return
  }

  if (!isNameCheck && (!code || !/^[a-z0-9-_]+$/i.test(code))) {
    templateForm.isAvailable = null
    return
  }

  if (!isNameCheck && code.length < 2) {
    templateForm.isAvailable = null
    return
  }

  templateForm.isChecking = true
  try {
    const data = await put(
      '/v1/services/formTemplates/checkcode',
      { code, title, isNameCheck },
      { showError: false },
    )
    if (isNameCheck) {
      if (data.suggestedCode) {
        isCodeChangeFromTitle.value = true
        templateForm.code = data.suggestedCode
        templateForm.isAvailable = data.isSuggestedCodeAvailable
      }
    } else {
      templateForm.isAvailable = data.message === 'available'
    }
  } catch {
    templateForm.isAvailable = null
  } finally {
    templateForm.isChecking = false
  }
}

const checkCodeDebounced = useDebounceFn(
  (isNameCheck = false) => checkTemplateCode(isNameCheck),
  500,
)

watch(
  () => templateForm.code,
  (newValue) => {
    if (newValue && !isCodeChangeFromTitle.value) {
      checkCodeDebounced(false)
    }
    isCodeChangeFromTitle.value = false
  },
)

watch(
  () => templateForm.title,
  (newValue) => {
    if (newValue) {
      checkCodeDebounced(true)
    }
  },
)

// Stamp the auto-assigned doc type as soon as the dialog opens in I&L
// mode. Watching `open` (rather than running once) so re-opening
// after a cancel/reset still pins the value before the wizard renders.
watch(
  open,
  (isOpen) => {
    if (isOpen && props.defaultClassification) {
      templateForm.documentTypeId = INSPECTION_LOG_DOC_TYPE_ID
    }
  },
  { immediate: true },
)

const createTemplate = useLiveMutation(async (db, formData) => {
  const inspectionsConfig = classificationConfigDefaults(props.defaultClassification)
  // I&L templates skip the DRAFT phase. The draft-then-activate dance
  // exists for controlled-document forms (CAPA / NC / Audit) that
  // typically go through a review before becoming part of the QMS. A
  // routine inspection log doesn't need that ceremony — admin clicked
  // "New Inspection Form", so they meant it.
  const statusId = props.defaultClassification ? 'ACTIVE' : formData.status
  const template = db.FormTemplate.create({
    title: formData.title,
    code: formData.code,
    documentTypeId: formData.documentTypeId,
    statusId,
    schema: formData.schema || [],
    config: {
      trainingRequired: formData.trainingRequired,
      retrainingOnRevision: formData.retrainingOnRevision,
      ...(inspectionsConfig ?? {}),
    },
  })
  await template.save()

  // Create site assignments
  for (const siteId of formData.selectedSites) {
    const sot = db.SiteOnTemplate.create({ siteId, templateId: template.id })
    await sot.save()
  }

  return template
})

function applyTemplate(preset) {
  selectedPreset.value = preset.title
  templateForm.schema = JSON.parse(JSON.stringify(preset.schema))
}

function selectBlank() {
  selectedPreset.value = 'blank'
  templateForm.schema = []
}

function closeWizard() {
  resetForm()
  open.value = false
  emit('cancel')
}

async function goToFormBuilder() {
  const valid = await templateValidator.value.$validate()
  if (!valid) return

  templateForm.isSubmitting = true
  try {
    const template = await createTemplate(templateForm)
    emit('next', template)
    open.value = false
  } catch (err) {
    console.error('Failed to create template:', err)
  } finally {
    templateForm.isSubmitting = false
  }
}

function resetForm() {
  templateForm.title = ''
  templateForm.code = ''
  templateForm.documentTypeId = null
  templateForm.status = 'DRAFT'
  templateForm.trainingRequired = false
  templateForm.retrainingOnRevision = false
  templateForm.selectedSites = []
  templateForm.schema = []
  templateForm.isAvailable = null
  templateForm.isChecking = false
  step.value = 1
  selectedPreset.value = null
}

function nextStep() {
  if (step.value === 1 && templateForm.isValid) {
    step.value = 2
  }
}

function prevStep() {
  if (step.value === 2) {
    step.value = 1
  }
}
</script>

<template>
  <BaseDialog v-model="open" maxWidth="2xl" persistent>
    <!-- Wizard Header -->
    <div class="tw:flex tw:justify-between tw:items-center tw:mb-4">
      <div>
        <div class="tw:text-xl tw:font-bold tw:text-on-main">
          {{ defaultClassification ? 'New Inspection &amp; Log Form' : 'Create New Template' }}
        </div>
        <div class="tw:text-xs tw:text-secondary">
          Step {{ step }}: {{ step === 1 ? 'Define Metadata' : 'Choose Template' }}
          <span v-if="defaultClassification" class="tw:ml-2 tw:text-amber-700 tw:font-medium">
            · pre-set as {{ defaultClassification.replace('_', ' ') }}
          </span>
        </div>
      </div>
      <button
        class="tw:p-1 tw:rounded tw:text-secondary tw:hover:bg-main-hover"
        @click="closeWizard"
      >
        <IconX :size="20" />
      </button>
    </div>

    <!-- Wizard Body -->
    <div class="tw:flex tw:flex-col tw:gap-4">
      <!-- Step 1: Metadata -->
      <div v-if="step === 1" class="tw:flex tw:flex-col tw:gap-4">
        <!-- Template Name -->
        <div>
          <label class="tw:text-sm tw:font-medium tw:text-on-main"
            >Template Name <span class="tw:text-bad">*</span></label
          >
          <BaseTextInput
            v-model="templateForm.title"
            name="title"
            placeholder="e.g. Internal Quality Audit Checklist"
          />
        </div>

        <!-- Document Type & Code Row.
             Document Type is hidden in I&L mode — log books are auto-
             stamped with the INSPECTION_LOG doc type. Code spans full
             width when the doc-type field is hidden. -->
        <div
          class="tw:grid tw:gap-4"
          :class="defaultClassification ? 'tw:grid-cols-1' : 'tw:grid-cols-2'"
        >
          <div v-if="!defaultClassification">
            <label class="tw:text-sm tw:font-medium tw:text-on-main"
              >Document Type <span class="tw:text-bad">*</span></label
            >
            <DocumentTypeSelectMenu v-model="templateForm.documentTypeId" required />
          </div>

          <div>
            <label class="tw:text-sm tw:font-medium tw:text-on-main"
              >Code <span class="tw:text-bad">*</span></label
            >
            <div class="tw:relative">
              <BaseTextInput v-model="templateForm.code" name="code" placeholder="e.g. QUA, AUD" />
              <div class="tw:absolute tw:right-2 tw:top-1/2 tw:-translate-y-1/2">
                <BaseSpinner v-if="templateForm.isChecking" size="sm" />
                <IconCheck
                  v-else-if="templateForm.isAvailable === true"
                  :size="16"
                  class="tw:text-green-600"
                />
                <IconCircleX
                  v-else-if="templateForm.isAvailable === false"
                  :size="16"
                  class="tw:text-bad"
                />
              </div>
            </div>
            <div class="tw:text-xs tw:text-secondary tw:mt-1">Used for Record ID generation.</div>
          </div>
        </div>

        <!-- Training Configuration — hidden in I&L mode. Inspection &
             log entries are quick floor-worker actions; tying them to
             training assignments is a controlled-document concern, not
             a record-entry one. Admin can still flip these on the
             template detail page if they need to. -->
        <div v-if="!defaultClassification" class="tw:bg-main-hover tw:p-3 tw:rounded-lg">
          <div class="tw:text-xs tw:font-semibold tw:uppercase tw:text-secondary tw:mb-3">
            Training Configuration
          </div>
          <div class="tw:flex tw:flex-col tw:gap-3">
            <div class="tw:flex tw:justify-between tw:items-center">
              <span class="tw:text-sm tw:text-on-main">Training Required?</span>
              <BaseSwitch v-model="templateForm.trainingRequired" />
            </div>
            <div class="tw:text-xs tw:text-secondary tw:-mt-2">
              If enabled, users must link a training course when creating a record.
            </div>

            <div class="tw:flex tw:justify-between tw:items-center">
              <span class="tw:text-sm tw:text-on-main">Retraining Required on Revision?</span>
              <BaseSwitch v-model="templateForm.retrainingOnRevision" />
            </div>
          </div>
        </div>

        <!-- Site Availability -->
        <div>
          <label class="tw:text-sm tw:font-medium tw:text-on-main">Site Availability</label>
          <SiteSelectMenu v-model="templateForm.selectedSites" multiple />
        </div>
      </div>

      <!-- Step 2: Template Selection with Previews -->
      <div v-else-if="step === 2" class="tw:flex tw:flex-col">
        <div class="tw:text-sm tw:text-secondary tw:mb-4">
          Select a starting point for your form schema. You can further customize this in the next
          step.
        </div>

        <div class="tw:grid tw:grid-cols-2 tw:gap-4 tw:overflow-auto tw:max-h-125 tw:p-1">
          <!-- Blank Option -->
          <BaseClickableRow
            class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:p-8 tw:border tw:border-divider tw:rounded-xl tw:transition-all tw:duration-200 tw:bg-main tw:hover:bg-main-hover tw:hover:border-primary"
            :class="{ 'tw:border-primary tw:bg-main-hover': selectedPreset === 'blank' }"
            aria-label="Start from a blank form"
            @click="selectBlank"
          >
            <IconCirclePlus :size="48" class="tw:text-secondary/40" />
            <div class="tw:text-lg tw:font-bold tw:mt-4 tw:text-on-main">Blank Form</div>
            <div class="tw:text-xs tw:text-secondary tw:text-center">Start from a clean slate</div>
          </BaseClickableRow>

          <!-- Presets -->
          <BaseClickableRow
            v-for="preset in QMS_TEMPLATES"
            :key="preset.code"
            class="tw:flex tw:flex-col tw:p-4 tw:border tw:border-divider tw:rounded-xl tw:transition-all tw:duration-200 tw:bg-main tw:hover:bg-main-hover tw:hover:border-primary"
            :class="{ 'tw:border-primary tw:bg-main-hover': selectedPreset === preset.title }"
            :aria-label="`Use template ${preset.title}`"
            @click="applyTemplate(preset)"
          >
            <div class="tw:flex tw:items-center tw:justify-between tw:mb-3">
              <span class="tw:text-sm tw:font-bold tw:text-primary">{{ preset.title }}</span>
              <IconFileDescription :size="16" class="tw:text-primary" />
            </div>
            <!-- Mini Preview Area -->
            <div
              class="tw:h-45 tw:overflow-hidden tw:relative tw:bg-main tw:border tw:border-divider tw:rounded-lg"
            >
              <div
                class="tw:w-[200%] tw:scale-[0.5] tw:origin-top-left tw:p-4 tw:pointer-events-none"
              >
                <DynamicForm :fields="preset.schema" readonly :modelValue="{}" />
              </div>
            </div>
          </BaseClickableRow>
        </div>
      </div>
    </div>

    <!-- Footer Actions -->
    <div class="tw:flex tw:justify-between tw:items-center tw:w-full tw:mt-6">
      <BaseButton v-if="step === 2" variant="text" @click="prevStep">
        <IconArrowLeft :size="16" class="tw:mr-1" />
        Back
      </BaseButton>
      <div v-else />

      <div class="tw:flex tw:gap-3">
        <BaseButton variant="outline" :disabled="templateForm.isSubmitting" @click="closeWizard">
          Cancel
        </BaseButton>
        <BaseButton v-if="step === 1" :disabled="!templateForm.isValid" @click="nextStep">
          Next: Select Template
          <IconArrowRight :size="16" class="tw:ml-1" />
        </BaseButton>
        <BaseButton
          v-else
          :disabled="selectedPreset === null || templateForm.isSubmitting"
          @click="goToFormBuilder"
        >
          <IconBrush :size="16" class="tw:mr-1" />
          Design Form
        </BaseButton>
      </div>
    </div>
  </BaseDialog>
</template>
