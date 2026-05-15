<script setup>
import {
  IconFileText,
  IconInfoCircle,
  IconHistory,
  IconArticle,
  IconSchool,
} from '@tabler/icons-vue'
import { required, minValue, helpers } from '@vuelidate/validators'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()
const toast = useToast()

const saving = ref(false)
const activeTab = ref('properties')
const selectedTemplate = ref(null)

const DEFAULT_TRAINING_CONFIG = {
  enabled: false,
  autoLaunch: true,
  managerId: null,
  requireManagerVerification: true,
  completionDueDays: 7,
  passingScore: 80,
  maxAttempts: 1,
  roleIds: [],
  userIds: [],
  assessment: [],
}

const DEFAULT_FORM = {
  title: '',
  documentTypeId: null,
  documentTemplateId: null,
  departmentId: null,
  effectiveDate: null,
  sections: [],
  changeNotes: '',
  siteId: null,
  tags: [],
  approverIds: [],
  periodicReviewMonths: 12,
  autoEffectiveOnApproval: true,
  relatedStandardId: null,
  prefix: null,
  trainingConfig: { ...DEFAULT_TRAINING_CONFIG },
}

// Form data
const form = ref({
  ...DEFAULT_FORM,
})

// Validation rules
const rules = computed(() => ({
  title: {
    required: helpers.withMessage('Document title is required', required),
  },
  documentTypeId: {
    required: helpers.withMessage('Document type is required', required),
  },
  prefix: {
    required: helpers.withMessage('Document prefix is required', required),
    validFormat: helpers.withMessage(
      'Only uppercase letters, numbers, hyphens, and placeholders {SITE_CODE}, {DEPARTMENT_CODE} are allowed',
      (value) => !value || (/^[A-Z0-9{}\-_]+$/.test(value) && /[A-Z0-9}]$/.test(value)),
    ),
    validPlaceholders: helpers.withMessage(
      'Only {SITE_CODE} and {DEPARTMENT_CODE} placeholders are supported',
      (value) => {
        if (!value) return true
        const placeholders = [...value.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1])
        return placeholders.every((p) => ['SITE_CODE', 'DEPARTMENT_CODE'].includes(p))
      },
    ),
    noDuplicatePlaceholders: helpers.withMessage(
      'Each placeholder can only be used once',
      (value) => {
        if (!value) return true
        const placeholders = [...value.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1])
        return new Set(placeholders).size === placeholders.length
      },
    ),
    noUnmatchedBraces: helpers.withMessage(
      'Invalid placeholder format - check your curly braces',
      (value) => {
        if (!value) return true
        const stripped = value.replace(/\{[A-Z_]+\}/g, '')
        return !stripped.includes('{') && !stripped.includes('}')
      },
    ),
  },
  departmentId: {
    required: helpers.withMessage('Department is required', required),
  },
  siteId: {
    required: helpers.withMessage('Site is required', required),
  },
  periodicReviewMonths: {
    required: helpers.withMessage('Periodic review period is required', required),
    minValue: helpers.withMessage('Must be at least 1 month', minValue(1)),
  },
}))

// Setup validator
const validator = useValidator(rules, form)

const createDocument = useLiveMutation(async (db, formData) => {
  // Resolve placeholders in prefix → {SITE_CODE}, {DEPARTMENT_CODE}
  let resolvedPrefix = formData.prefix

  if (/\{SITE_CODE\}/i.test(resolvedPrefix)) {
    const site = await db.Site.findByPk(formData.siteId)
    if (!site) throw new Error(`Site not found: ${formData.siteId}`)
    resolvedPrefix = resolvedPrefix.replace(/\{SITE_CODE\}/gi, site.code)
  }

  if (/\{DEPARTMENT_CODE\}/i.test(resolvedPrefix)) {
    const department = await db.Department.findByPk(formData.departmentId)
    if (!department) throw new Error(`Department not found: ${formData.departmentId}`)
    resolvedPrefix = resolvedPrefix.replace(/\{DEPARTMENT_CODE\}/gi, department.code)
  }

  // Get or create counter scoped to the resolved prefix
  let documentCounter = await db.DocumentCounter.where('prefix', resolvedPrefix).first()
  if (!documentCounter) {
    documentCounter = db.DocumentCounter.create({ prefix: resolvedPrefix, currentValue: 1 })
  } else {
    documentCounter.currentValue += 1
  }

  const doc = db.Document.create({
    title: formData.title,
    documentTypeId: formData.documentTypeId,
    documentTemplateId: formData.documentTemplateId,
    departmentId: formData.departmentId,
    siteId: formData.siteId,
    prefix: formData.prefix,
    relatedStandardId: formData.relatedStandardId,
    periodicReviewMonths: formData.periodicReviewMonths,
    autoEffectiveOnApproval: formData.autoEffectiveOnApproval,
    workflowVersionId: formData.workflowVersionId,
    statusId: 'ACTIVE',
    docNumber: `${resolvedPrefix}-${String(documentCounter.currentValue).padStart(3, '0')}`,
  })
  await doc.save()
  await documentCounter.save()

  const version = db.DocumentVersion.create({
    documentId: doc.id,
    versionMajor: 1,
    versionMinor: 0,
    statusId: 'DRAFT',
    changeSummary: formData.changeSummary || '',
    effectiveDate: formData.effectiveDate,
  })
  await version.save()

  if (formData.sections?.length > 0) {
    for (const [index, section] of formData.sections.entries()) {
      const docSection = db.DocumentSection.create({
        documentVersionId: version.id,
        documentId: doc.id,
        title: section.title,
        sectionType: section.sectionType || 'text',
        content: section.content || null,
        attachments: section.attachments || null,
        order: section.order ?? index,
      })
      await docSection.save()
    }
  }

  return doc
})

async function saveDraft() {
  // Validate form fields using Vuelidate
  const isValid = await validator.value.$validate()

  if (!isValid) {
    toast.warning('Please fix the validation errors before saving')
    // Switch to properties tab if validation fails
    activeTab.value = 'properties'
    return
  }

  saving.value = true
  try {
    const doc = await createDocument({ ...form.value })
    if (doc) {
      toast.success('Document saved as draft')
      form.value = { ...DEFAULT_FORM }
      router.push(getCompanyPath(`/documents/${doc.id}`))
    }
  } catch (error) {
    console.error('Error saving document:', error)
    toast.error('Failed to save document. Please try again.')
  } finally {
    saving.value = false
  }
}

async function continueToNext() {
  const isValid = await validator.value.$validate()
  if (!isValid) {
    toast.warning('Please fix the validation errors before continuing')
    activeTab.value = 'properties'
    return
  } else {
    goToNextTab()
  }
}

function goToNextTab() {
  if (activeTab.value === 'properties') {
    activeTab.value = 'changeControl'
  } else if (activeTab.value === 'changeControl') {
    activeTab.value = 'content'
  } else if (activeTab.value === 'content') {
    activeTab.value = 'training'
  }
}

function cancel() {
  form.value = { ...DEFAULT_FORM } // Clear form on cancel
  router.push(getCompanyPath('/documents'))
}
</script>

<template>
  <div class="tw:relative tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-on-sidebar">
        <IconFileText class="tw:text-primary tw:size-6" />
        <h2 class="tw:text-lg tw:font-bold tw:tracking-tight tw:text-nowrap">Create Document</h2>
      </div>
    </SafeTeleport>

    <!-- Scrollable content -->
    <div class="tw:flex-1 tw:overflow-y-auto tw:pb-24">
      <div class="tw:max-w-4xl tw:mx-auto tw:px-6 tw:py-8">
        <!-- Header -->
        <div class="tw:mb-8">
          <h1 class="tw:text-3xl tw:font-extrabold tw:text-on-sidebar tw:mb-6">
            Create New Document
          </h1>

          <!-- Tabs Navigation -->
          <div class="tw:flex tw:border-b tw:border-divider">
            <button
              :class="[
                'tw:px-6 tw:py-3 tw:border-b-2 tw:font-semibold tw:text-sm tw:flex tw:items-center tw:gap-2 tw:transition-colors',
                activeTab === 'properties'
                  ? 'tw:border-primary tw:text-primary'
                  : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar',
              ]"
              @click="activeTab = 'properties'"
            >
              <IconInfoCircle :size="18" /> Properties
            </button>
            <button
              :class="[
                'tw:px-6 tw:py-3 tw:border-b-2 tw:font-semibold tw:text-sm tw:flex tw:items-center tw:gap-2 tw:transition-colors',
                activeTab === 'changeControl'
                  ? 'tw:border-primary tw:text-primary'
                  : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar',
              ]"
              @click="activeTab = 'changeControl'"
            >
              <IconHistory :size="18" /> Change Control
            </button>
            <button
              :class="[
                'tw:px-6 tw:py-3 tw:border-b-2 tw:font-semibold tw:text-sm tw:flex tw:items-center tw:gap-2 tw:transition-colors',
                activeTab === 'content'
                  ? 'tw:border-primary tw:text-primary'
                  : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar',
              ]"
              @click="activeTab = 'content'"
            >
              <IconArticle :size="18" /> Content
            </button>
            <button
              :class="[
                'tw:px-6 tw:py-3 tw:border-b-2 tw:font-semibold tw:text-sm tw:flex tw:items-center tw:gap-2 tw:transition-colors',
                activeTab === 'training'
                  ? 'tw:border-primary tw:text-primary'
                  : 'tw:border-transparent tw:text-secondary tw:hover:text-on-sidebar',
              ]"
              @click="activeTab = 'training'"
            >
              <IconSchool :size="18" /> Training Assessment
            </button>
          </div>
        </div>

        <!-- Tab Content -->
        <div class="tw:space-y-6">
          <!-- Properties Tab -->
          <DocumentsCreateProperties
            v-show="activeTab === 'properties'"
            v-model="form"
            v-model:selectedTemplate="selectedTemplate"
          />

          <!-- Change Control Tab -->
          <DocumentsCreateChangeControl v-show="activeTab === 'changeControl'" />

          <!-- Content Tab -->
          <DocumentsCreateContent
            v-show="activeTab === 'content'"
            :form="form"
            :selectedTemplate="selectedTemplate"
          />

          <!-- Training Assessment Tab -->
          <DocumentsCreateTraining v-show="activeTab === 'training'" v-model="form.trainingConfig" />
        </div>
      </div>
    </div>

    <!-- Sticky Footer Action Bar -->
    <div
      class="tw:absolute tw:bottom-0 tw:left-0 tw:right-0 tw:bg-sidebar/80 tw:backdrop-blur-md tw:border-t tw:border-divider tw:px-6 tw:py-4 tw:z-50"
    >
      <div class="tw:max-w-4xl tw:mx-auto tw:flex tw:items-center tw:justify-between">
        <div class="tw:flex tw:items-center tw:gap-4 tw:text-secondary tw:text-sm"></div>
        <div class="tw:flex tw:items-center tw:gap-4">
          <BaseButton variant="danger" :isLoading="saving" @click="cancel"> Cancel </BaseButton>
          <BaseButton variant="secondary" :isLoading="saving" @click="saveDraft">
            Save Draft
          </BaseButton>
          <BaseButton v-if="activeTab !== 'training'" :isLoading="saving" @click="continueToNext">
            Continue
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
