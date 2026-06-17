<script setup>
import { IconInfoCircle, IconSettings, IconCircleCheck, IconCircleX } from '@tabler/icons-vue'
import { required, minValue, helpers } from '@vuelidate/validators'
import { useValidator } from '@shared/composables/validator.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { validateUUID } from '@/utils/validators.js'
import { currentCompany } from '@/utils/currentCompany.js'
import { get } from '@/api'

const props = defineProps({
  id: {
    type: String,
    default: null,
  },
})

const router = useRouter()
const toast = useToast()

const saving = ref(false)
const checkingPrefix = ref(false)
const prefixAvailable = ref(null)
const originalPrefix = ref(null)

const isEditMode = computed(() => validateUUID(props.id))

const existingTemplate = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!isEditMode.value || !id) return null
    return db.DocumentTemplate.findByPk(id)
  },
  { models: ['DocumentTemplate'] },
)

const loading = computed(() => isEditMode.value && existingTemplate.value === undefined)

const form = ref({
  name: '',
  prefix: '',
  departmentId: null,
  relatedStandardId: null,
  trainingAvailable:
    currentCompany.value?.settings?.defaultDocumentTemplateTrainingAvailable ?? true,
  retrainingOnVersion:
    currentCompany.value?.settings?.defaultDocumentTemplateRetrainingOnVersion ?? true,
  periodicReviewMonths:
    currentCompany.value?.settings?.defaultDocumentTemplatePeriodicReviewMonths ?? 12,
  reviewLimitDays: currentCompany.value?.settings?.defaultDocumentTemplateReviewLimitDays ?? 14,
  approvalLimitDays: currentCompany.value?.settings?.defaultDocumentTemplateApprovalLimitDays ?? 7,
  autoEffectiveOnApproval:
    currentCompany.value?.settings?.defaultDocumentTemplateAutoEffectiveOnApproval ?? true,
  showSectionTitles: true,
  sections: [{ id: crypto.randomUUID(), order: 1, title: 'Purpose', sectionType: 'text' }],
})

watch(
  existingTemplate,
  (t) => {
    if (t) {
      form.value = {
        name: t.name,
        prefix: t.prefix,
        departmentId: t.departmentId,
        relatedStandardId: t.relatedStandardId,
        trainingAvailable: t.trainingAvailable,
        retrainingOnVersion: t.retrainingOnVersion,
        periodicReviewMonths: t.periodicReviewMonths,
        reviewLimitDays: t.reviewLimitDays,
        approvalLimitDays: t.approvalLimitDays,
        autoEffectiveOnApproval: t.autoEffectiveOnApproval,
        showSectionTitles: t.showSectionTitles,
        sections: t.sections ? [...t.sections] : [],
      }
      originalPrefix.value = t.prefix
      prefixAvailable.value = true
    }
  },
  { immediate: true },
)

function onPrefixInput(value) {
  form.value.prefix = value.toUpperCase()
}

const rules = computed(() => ({
  name: { required: helpers.withMessage('Template name is required', required) },
  prefix: {
    required: helpers.withMessage('Document prefix is required', required),
    validFormat: helpers.withMessage(
      'Only uppercase letters, numbers, hyphens, and placeholders {SITE_CODE}, {DEPARTMENT_CODE} are allowed',
      (value) => /^[A-Z0-9{}\-_]+$/.test(value) && /[A-Z0-9}]$/.test(value),
    ),
    validPlaceholders: helpers.withMessage(
      'Only {SITE_CODE} and {DEPARTMENT_CODE} placeholders are supported',
      (value) => {
        const placeholders = [...value.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1])
        return placeholders.every((p) => ['SITE_CODE', 'DEPARTMENT_CODE'].includes(p))
      },
    ),
    noDuplicatePlaceholders: helpers.withMessage(
      'Each placeholder can only be used once',
      (value) => {
        const placeholders = [...value.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1])
        return new Set(placeholders).size === placeholders.length
      },
    ),
    noUnmatchedBraces: helpers.withMessage(
      'Invalid placeholder format - check your curly braces',
      (value) => {
        const stripped = value.replace(/\{[A-Z_]+\}/g, '')
        return !stripped.includes('{') && !stripped.includes('}')
      },
    ),
  },
  periodicReviewMonths: {
    required: helpers.withMessage('Periodic review period is required', required),
    minValue: helpers.withMessage('Must be at least 1 month', minValue(1)),
  },
  reviewLimitDays: {
    required: helpers.withMessage('Review limit is required', required),
    minValue: helpers.withMessage('Must be at least 1 day', minValue(1)),
  },
  approvalLimitDays: {
    required: helpers.withMessage('Approval limit is required', required),
    minValue: helpers.withMessage('Must be at least 1 day', minValue(1)),
  },
  sections: {
    minLength: helpers.withMessage(
      'At least one section is required',
      (value) => value && value?.length > 0,
    ),
    hasValidSections: helpers.withMessage('All sections must have a title', (value) => {
      if (!value || value.length === 0) return true
      return value.every((section) => section.title && section.title.trim().length > 0)
    }),
  },
}))

const validator = useValidator(rules, form)

const pageTitle = computed(() =>
  isEditMode.value ? 'Edit Document Template' : 'Create Document Template',
)

async function checkPrefix(prefix) {
  if (!prefix || prefix.length < 2) {
    prefixAvailable.value = null
    return
  }
  if (isEditMode.value && prefix === originalPrefix.value) {
    prefixAvailable.value = true
    return
  }
  checkingPrefix.value = true
  try {
    const data = await get(
      `/v1/services/documentTemplates/checkPrefix/${encodeURIComponent(prefix)}`,
      { showError: false },
    )
    prefixAvailable.value = data.available
  } catch {
    prefixAvailable.value = false
  } finally {
    checkingPrefix.value = false
  }
}

const debouncedCheckPrefix = useDebounceFn(checkPrefix, 500)

watch(() => form.value.prefix, debouncedCheckPrefix)

const createTemplate = useLiveMutation(async (db, data) => {
  const t = db.DocumentTemplate.create(data)
  await t.save()
  return t
})

async function saveTemplate() {
  const isValid = await validator.value.$validate()
  if (!isValid) {
    toast.error(validator.value.$errors[0].$message || 'Please fix validation errors before saving')
    return
  }
  if (prefixAvailable.value === false) return

  saving.value = true
  let docId
  try {
    if (isEditMode.value && existingTemplate.value) {
      const t = existingTemplate.value
      docId = t.id
      Object.assign(t, form.value)
      await t.save()
      toast.success('Document template updated successfully')
    } else {
      const t = await createTemplate(form.value)
      docId = t.id
      toast.success('Document template created successfully')
    }
    router.push(getCompanyPath(`/document-templates/${docId}`))
  } catch (error) {
    // BaseModel validation errors are caught here
    toast.error(error.message || 'An error occurred while saving the document template')
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push(getCompanyPath('/document-templates'))
}

const breadcrumbs = computed(() => [
  { label: 'Document Templates', to: getCompanyPath('/document-templates') },
  { label: isEditMode.value ? 'Edit' : 'Create' },
])
</script>

<template>
  <BasePage width="narrow" fullHeight>
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs :items="breadcrumbs" />
    </SafeTeleport>

    <!-- Loading overlay -->
    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-full">
      <BaseSpinner size="lg" />
    </div>

    <!-- Scrollable content -->
    <div v-else class="tw:flex-1 tw:min-h-0 tw:overflow-y-auto tw:pb-24">
      <div class="tw:max-w-5xl tw:mx-auto tw:px-6 tw:py-8">
        <div class="tw:mb-8">
          <h1 class="tw:text-3xl tw:font-black tw:text-on-sidebar tw:tracking-tight">
            {{ pageTitle }}
          </h1>
          <p class="tw:text-secondary tw:mt-2">
            Define the lifecycle, metadata, and structural components for your organization's formal
            documents.
          </p>
        </div>

        <div class="tw:space-y-6">
          <!-- Basic Information -->
          <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
            <div
              class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-2"
            >
              <IconInfoCircle :size="22" class="tw:text-primary" />
              <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Basic Information</h2>
            </div>
            <div class="tw:p-6 tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-6">
              <BaseTextInput
                v-model="form.name"
                name="name"
                label="Name"
                placeholder="e.g. Standard Operating Procedure"
                :required="true"
              />
              <BaseField
                required
                hint='Prefix for document numbers. Supports placeholders: {SITE_CODE}, {DEPARTMENT_CODE} (e.g. "DOC", "SOP-{SITE_CODE}").'
              >
                <template #label>
                  <span class="tw:flex tw:items-center tw:gap-2">
                    Document Prefix
                    <BaseSpinner v-if="checkingPrefix" size="xs" />
                    <IconCircleCheck
                      v-else-if="prefixAvailable === true"
                      :size="16"
                      class="tw:text-green-600"
                    />
                    <IconCircleX
                      v-else-if="prefixAvailable === false"
                      :size="16"
                      class="tw:text-red-500"
                    />
                  </span>
                </template>
                <template #default="{ id: fieldId }">
                  <BaseTextInput
                    :id="fieldId"
                    :modelValue="form.prefix"
                    placeholder="DOC"
                    :required="true"
                    @update:modelValue="onPrefixInput"
                  />
                </template>
              </BaseField>
              <BaseField label="Department">
                <DepartmentSelectMenu v-model="form.departmentId" />
              </BaseField>
              <BaseField label="Related Standard">
                <RelatedStandardSelectMenu v-model="form.relatedStandardId" />
              </BaseField>
            </div>
          </div>

          <!-- Default Settings -->
          <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
            <div
              class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-2"
            >
              <IconSettings :size="22" class="tw:text-primary" />
              <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Default Settings</h2>
            </div>
            <div class="tw:p-6 tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-x-12 tw:gap-y-6">
              <div>
                <BaseCheckbox v-model="form.trainingAvailable" label="Yes">
                  <label class="tw:inline-block tw:mb-1 tw:text-sm tw:font-medium">
                    Training Available?
                  </label>
                </BaseCheckbox>
              </div>
              <div>
                <BaseCheckbox v-model="form.retrainingOnVersion" label="Yes">
                  <label class="tw:inline-block tw:mb-1 tw:text-sm tw:font-medium">
                    Retraining Required on Each Version?
                  </label>
                </BaseCheckbox>
              </div>
              <BaseTextInput
                v-model.number="form.periodicReviewMonths"
                name="periodicReviewMonths"
                label="Periodic Review Period (months)"
                type="number"
                :required="true"
              />
              <BaseTextInput
                v-model.number="form.reviewLimitDays"
                name="reviewLimitDays"
                label="Review Limit (days)"
                type="number"
                :required="true"
              />
              <BaseTextInput
                v-model.number="form.approvalLimitDays"
                name="approvalLimitDays"
                label="Approval Limit (days)"
                type="number"
                :required="true"
              />
              <div>
                <BaseCheckbox v-model="form.autoEffectiveOnApproval" label="Yes">
                  <label class="tw:inline-block tw:mb-1 tw:text-sm tw:font-medium">
                    Auto Effective on Approval?
                  </label>
                </BaseCheckbox>
              </div>
              <div>
                <BaseCheckbox v-model="form.showSectionTitles" label="Yes">
                  <label class="tw:inline-block tw:mb-1 tw:text-sm tw:font-medium">
                    Show Text Section Titles?
                  </label>
                </BaseCheckbox>
              </div>
            </div>
          </div>

          <!-- Sections Builder -->
          <DocumentSectionsEditor v-model="form.sections" />
        </div>
      </div>
    </div>

    <!-- Sticky Footer -->
    <div
      class="tw:relative tw:bottom-0 tw:right-0 tw:w-full tw:bg-main/80 tw:backdrop-blur-md tw:border-t tw:border-divider tw:px-6 tw:py-4 tw:z-50"
    >
      <div class="tw:max-w-5xl tw:mx-auto tw:flex tw:items-center tw:justify-between">
        <button
          class="tw:px-4 tw:py-2 tw:text-sm tw:text-secondary tw:hover:text-on-sidebar tw:transition-colors"
          :disabled="saving"
          @click="goBack"
        >
          Discard
        </button>
        <BaseButton :loading="saving" @click="saveTemplate">
          {{ isEditMode ? 'Save Changes' : 'Create Template' }}
        </BaseButton>
      </div>
    </div>
  </BasePage>
</template>
