<script setup>
import { IconInfoCircle, IconSettings, IconCircleCheck, IconCircleX } from '@tabler/icons-vue'
import { required, minValue } from '@shared/components/form/validators.js'
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

const formRef = ref(null)
const saving = ref(false)
const saveError = ref('')
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

// Prefix validation rules
function prefixValidFormat(value) {
  if (!value) return true
  return (
    (/^[A-Z0-9{}\-_]+$/.test(value) && /[A-Z0-9}]$/.test(value)) ||
    'Only uppercase letters, numbers, hyphens, and placeholders {SITE_CODE}, {DEPARTMENT_CODE} are allowed'
  )
}

function prefixValidPlaceholders(value) {
  if (!value) return true
  const placeholders = [...value.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1])
  return (
    placeholders.every((p) => ['SITE_CODE', 'DEPARTMENT_CODE'].includes(p)) ||
    'Only {SITE_CODE} and {DEPARTMENT_CODE} placeholders are supported'
  )
}

function prefixNoDuplicatePlaceholders(value) {
  if (!value) return true
  const placeholders = [...value.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1])
  return (
    new Set(placeholders).size === placeholders.length || 'Each placeholder can only be used once'
  )
}

function prefixNoUnmatchedBraces(value) {
  if (!value) return true
  const stripped = value.replace(/\{[A-Z_]+\}/g, '')
  return (
    (!stripped.includes('{') && !stripped.includes('}')) ||
    'Invalid placeholder format - check your curly braces'
  )
}

// Sections validation rules
function sectionsMinLength(value) {
  return (value && value.length > 0) || 'At least one section is required'
}

function sectionsHaveValidTitles(value) {
  if (!value || value.length === 0) return true
  return (
    value.every((section) => section.title && section.title.trim().length > 0) ||
    'All sections must have a title'
  )
}

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

async function onSubmit() {
  if (saving.value) return
  saveError.value = ''
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
    saveError.value = error?.message || 'An error occurred while saving the document template'
    toast.error(saveError.value)
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push(getCompanyPath('/document-templates'))
}
</script>

<template>
  <BasePage width="standard" fullHeight>
    <PageHeader :title="pageTitle">
      <template #subtitle>
        Define the lifecycle, metadata, and structural components for your organization's formal
        documents.
      </template>
    </PageHeader>

    <!-- Loading overlay -->
    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-full">
      <BaseSpinner size="lg" />
    </div>

    <!-- Scrollable content -->
    <div v-else class="tw:flex-1 tw:min-h-0 tw:overflow-y-auto tw:pb-24">
      <div class="tw:py-8">
        <BaseForm ref="formRef" hideFooter @submit="onSubmit">
          <div class="tw:space-y-6">
            <!-- Basic Information -->
            <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
              <div
                class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-2"
              >
                <IconInfoCircle :size="22" class="tw:text-primary" />
                <h2 class="tw:text-lg tw:font-semibold tw:text-on-sidebar">Basic Information</h2>
              </div>
              <div class="tw:p-6 tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-6">
                <BaseField
                  label="Name"
                  required
                  :value="form.name"
                  :rules="[required('Template name is required')]"
                >
                  <template #default="field">
                    <BaseTextInput
                      v-bind="field"
                      v-model="form.name"
                      placeholder="e.g. Standard Operating Procedure"
                    />
                  </template>
                </BaseField>

                <BaseField
                  required
                  hint='Prefix for document numbers. Supports placeholders: {SITE_CODE}, {DEPARTMENT_CODE} (e.g. "DOC", "SOP-{SITE_CODE}").'
                  :value="form.prefix"
                  :rules="[
                    required('Document prefix is required'),
                    prefixValidFormat,
                    prefixValidPlaceholders,
                    prefixNoDuplicatePlaceholders,
                    prefixNoUnmatchedBraces,
                  ]"
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
                  <template #default="field">
                    <BaseTextInput
                      v-bind="field"
                      :modelValue="form.prefix"
                      placeholder="DOC"
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
                <h2 class="tw:text-lg tw:font-semibold tw:text-on-sidebar">Default Settings</h2>
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
                <BaseField
                  label="Periodic Review Period (months)"
                  required
                  :value="form.periodicReviewMonths"
                  :rules="[
                    required('Periodic review period is required'),
                    minValue(1, 'Must be at least 1 month'),
                  ]"
                >
                  <template #default="field">
                    <BaseTextInput
                      v-bind="field"
                      v-model.number="form.periodicReviewMonths"
                      type="number"
                    />
                  </template>
                </BaseField>
                <BaseField
                  label="Review Limit (days)"
                  required
                  :value="form.reviewLimitDays"
                  :rules="[
                    required('Review limit is required'),
                    minValue(1, 'Must be at least 1 day'),
                  ]"
                >
                  <template #default="field">
                    <BaseTextInput
                      v-bind="field"
                      v-model.number="form.reviewLimitDays"
                      type="number"
                    />
                  </template>
                </BaseField>
                <BaseField
                  label="Approval Limit (days)"
                  required
                  :value="form.approvalLimitDays"
                  :rules="[
                    required('Approval limit is required'),
                    minValue(1, 'Must be at least 1 day'),
                  ]"
                >
                  <template #default="field">
                    <BaseTextInput
                      v-bind="field"
                      v-model.number="form.approvalLimitDays"
                      type="number"
                    />
                  </template>
                </BaseField>
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
            <BaseField :value="form.sections" :rules="[sectionsMinLength, sectionsHaveValidTitles]">
              <DocumentSectionsEditor v-model="form.sections" />
            </BaseField>
          </div>
        </BaseForm>
      </div>
    </div>

    <!-- Sticky Footer -->
    <div
      class="tw:relative tw:bottom-0 tw:right-0 tw:w-full tw:bg-main/80 tw:backdrop-blur-md tw:border-t tw:border-divider tw:px-6 tw:py-4 tw:z-modal"
    >
      <div class="tw:flex tw:items-center tw:justify-between">
        <button
          class="tw:px-4 tw:py-2 tw:text-sm tw:text-secondary tw:hover:text-on-sidebar tw:transition-colors"
          :disabled="saving"
          @click="goBack"
        >
          Discard
        </button>
        <div class="tw:flex tw:flex-col tw:items-end tw:gap-1">
          <p v-if="saveError" class="tw:text-sm tw:text-red-600">{{ saveError }}</p>
          <BaseButton :loading="saving" @click="formRef?.submit()">
            {{ isEditMode ? 'Save Changes' : 'Create Template' }}
          </BaseButton>
        </div>
      </div>
    </div>
  </BasePage>
</template>
