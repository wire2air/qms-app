<script setup>
import {
  IconFileText,
  IconInfoCircle,
  IconArticle,
  IconSchool,
  IconSparkles,
  IconFileUpload,
} from '@tabler/icons-vue'
import { required, minValue, helpers } from '@vuelidate/validators'
import { DateTime } from 'luxon'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { currentSession, canUseAi } from '@/utils/currentSession.js'
import { db } from '@models/index'

const router = useRouter()
const toast = useToast()

const saving = ref(false)
const activeTab = ref('properties')

// Admin-defined custom fields — held locally, persisted after the doc exists.
const customFieldsData = ref({})
const customFieldsRef = ref(null)
const selectedTemplate = ref(null)

const DEFAULT_TRAINING_CONFIG = {
  // Training defaults ON — the "Enable training" toggle now lives on the
  // Properties tab so authors see it up front. They untoggle for docs that
  // need no training; the submit-for-review gate enforces an audience.
  enabled: true,
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
  // Owner = accountable for the lifecycle (periodic review, effectiveness).
  // Defaults to the creator (set below); the author can hand it to another user.
  // Author is implicit = creator (set by the Document model on create).
  ownerId: null,
  effectiveDate: null,
  sections: [],
  // Change control — optional on v1.0, required on every revision after.
  // The Change Control tab binds to these fields via v-model.
  changeSummary: '',
  changeReason: '',
  changeType: null, // ADMINISTRATIVE | MINOR | MAJOR
  regulatoryImpact: false,
  regulatoryImpactNotes: '',
  siteId: null,
  tags: [],
  approverIds: [],
  periodicReviewMonths: 12,
  autoEffectiveOnApproval: true,
  relatedStandardId: null,
  prefix: null,
  trainingConfig: { ...DEFAULT_TRAINING_CONFIG },
}

// Form data — owner defaults to the creating user (the author can reassign it
// in the Properties tab before saving); effective date defaults to today.
const form = ref({
  ...DEFAULT_FORM,
  ownerId: currentSession.value?.userId ?? null,
  effectiveDate: DateTime.now(),
})

// Validation rules
const rules = computed(() => ({
  title: {
    required: helpers.withMessage('Document title is required', required),
  },
  documentTypeId: {
    required: helpers.withMessage('Document type is required', required),
  },
  documentTemplateId: {
    required: helpers.withMessage('Document template is required', required),
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
  // Conditional: when the author flags regulatory impact, the notes field
  // is required. Mirrors the DB CHECK constraint so the message lands in
  // the UI before the save round-trip.
  regulatoryImpactNotes: {
    requiredWhenImpact: helpers.withMessage(
      'Notes are required when regulatory impact is flagged',
      (value) => !form.value.regulatoryImpact || (value && value.trim().length > 0),
    ),
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
    // Owner (accountable). Author defaults to the creator in the Document model.
    userId: formData.ownerId || currentSession.value?.userId,
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
    // Change control — optional on v1.0 but captured if provided. The
    // DB CHECK constraint enforces required-ness only on v > 1.0.
    changeSummary: formData.changeSummary || '',
    changeReason: formData.changeReason || null,
    changeType: formData.changeType || null,
    regulatoryImpact: !!formData.regulatoryImpact,
    regulatoryImpactNotes: formData.regulatoryImpact
      ? formData.regulatoryImpactNotes || null
      : null,
    effectiveDate: formData.effectiveDate,
    // trainingConfig now lives on the version (per-revision); each new version
    // can have its own roles/users/questions.
    trainingConfig: formData.trainingConfig?.enabled ? formData.trainingConfig : null,
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
        isAddOn: section.isAddOn ?? false,
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
    // All validated fields live on the Properties tab.
    activeTab.value = 'properties'
    return
  }
  if ((await customFieldsRef.value?.validate()) === false) {
    toast.warning('Complete the required fields under Additional information')
    activeTab.value = 'properties'
    return
  }

  saving.value = true
  try {
    const doc = await createDocument({ ...form.value })
    if (doc) {
      // Persist custom fields against the new document (best-effort).
      try {
        await customFieldsRef.value?.persist(doc.id)
      } catch (cfErr) {
        toast.warning(cfErr?.message || 'Document saved, but custom fields could not be saved — add them on the document page')
      }
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

function cancel() {
  form.value = { ...DEFAULT_FORM } // Clear form on cancel
  router.push(getCompanyPath('/documents'))
}

// ─── AI draft integration ──────────────────────────────────────────────────
const showDraftDialog = ref(false)

// Look up the department's display name once when needed — the AI task wants
// a human-readable string (not the UUID) so its language matches the team.
const aiDepartmentName = ref(null)
watch(
  () => form.value.departmentId,
  async (deptId) => {
    if (!deptId) {
      aiDepartmentName.value = null
      return
    }
    const dept = await db.Department.findByPk(deptId)
    aiDepartmentName.value = dept?.name ?? null
  },
  { immediate: true },
)

function handleAiDraft(draft) {
  // Map the AI's structured output onto the form. The user reviews + edits
  // in the existing tabs before saving — nothing persists here.
  // `id` is required by DocumentSectionsEditor's v-for key and removeSection
  // filter; without it, deleting one section filters out all id-less rows.
  form.value.title = draft.title
  // AI picks the document type from the seeded list (SOP, POLICY, …) so
  // the type dropdown is pre-selected. Site + Department defaults stay
  // whatever the user already had (we don't overwrite explicit picks).
  if (draft.documentTypeId) form.value.documentTypeId = draft.documentTypeId
  form.value.sections = draft.sections.map((s, idx) => ({
    id: crypto.randomUUID(),
    title: s.title,
    content: s.content,
    sectionType: 'text',
    order: s.order ?? idx + 1,
    attachments: null,
    isAddOn: true,
  }))
  // Jump to the Content tab so the user immediately sees what landed.
  activeTab.value = 'content'
  toast.success('AI draft applied — review each section before saving.')
}

// ─── PDF import integration ──────────────────────────────────────────────
// Emit contract: { title, description, sections: [{ title, content,
// sectionType, attachments, order }] }. sectionType is now meaningful —
// the structured path emits all 'text' sections; the summarise path
// emits one 'text' summary section plus one 'attachment' section
// carrying the uploaded original PDF in `attachments`. Honour both.
const showImportDialog = ref(false)
function handlePdfImport(draft) {
  form.value.title = draft.title
  // AI picks the document type from the seeded list. Site + Department
  // defaults stay whatever the user already had — only the type changes
  // when the dialog tells us its best match.
  if (draft.documentTypeId) form.value.documentTypeId = draft.documentTypeId
  form.value.sections = draft.sections.map((s, idx) => ({
    id: crypto.randomUUID(),
    title: s.title,
    content: s.content ?? null,
    sectionType: s.sectionType ?? 'text',
    order: s.order ?? idx + 1,
    attachments: s.attachments ?? null,
    isAddOn: true,
  }))
  activeTab.value = 'content'
  toast.success('PDF imported — review each section before saving.')
}

// Change Control is omitted on create — a brand-new document is always v1.0
// (a first draft) where change control doesn't apply. It appears on revisions.
const docTabs = [
  { value: 'properties', label: 'Properties', icon: IconInfoCircle },
  { value: 'content', label: 'Content', icon: IconArticle },
  { value: 'training', label: 'Training Assessment', icon: IconSchool },
]
</script>

<template>
  <BasePage width="standard" fullHeight class="tw:relative">
    <PageHeader :icon="IconFileText" title="Create Document">
      <template #actions>
        <button
          v-if="canUseAi"
          class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-divider tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-sidebar tw:transition-colors tw:font-medium tw:px-3 tw:py-1.5 tw:text-sm"
          title="Import an existing PDF (SOP, work instruction, etc.) — extracts text + images and structures the content"
          @click="showImportDialog = true"
        >
          <IconFileUpload :size="15" />
          Import PDF
        </button>
        <button
          v-if="canUseAi"
          class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-primary/30 tw:bg-primary/5 tw:text-primary tw:hover:bg-primary/10 tw:transition-colors tw:font-medium tw:px-3 tw:py-1.5 tw:text-sm"
          title="Use AI to draft an initial outline you can edit"
          @click="showDraftDialog = true"
        >
          <IconSparkles :size="15" />
          Draft with AI
        </button>
      </template>
    </PageHeader>

    <!-- Scrollable content -->
    <div class="tw:flex-1 tw:min-h-0 tw:overflow-y-auto tw:pb-24">
      <BaseTabs v-model="activeTab" :tabs="docTabs" ariaLabel="Create document">
        <!-- keepAlive: panels stay mounted so form state survives tab switches -->
        <BaseTabPanel value="properties" keepAlive class="tw:pt-6">
          <DocumentsCreateProperties v-model="form" v-model:selectedTemplate="selectedTemplate" />
          <!-- Admin-defined custom fields. Self-hides when none configured. -->
          <div class="tw:mt-4">
            <CustomFieldsCreateSection
              ref="customFieldsRef"
              v-model="customFieldsData"
              entityType="Document"
            />
          </div>
        </BaseTabPanel>
        <BaseTabPanel value="content" keepAlive class="tw:pt-6">
          <DocumentsCreateContent :form="form" :selectedTemplate="selectedTemplate" />
        </BaseTabPanel>
        <BaseTabPanel value="training" keepAlive class="tw:pt-6">
          <DocumentsCreateTraining v-model="form.trainingConfig" />
        </BaseTabPanel>
      </BaseTabs>
    </div>

    <!-- Sticky Footer Action Bar -->
    <div
      class="tw:absolute tw:bottom-0 tw:left-0 tw:right-0 tw:bg-sidebar/80 tw:backdrop-blur-md tw:border-t tw:border-divider tw:px-6 tw:py-4 tw:z-modal"
    >
      <div class="tw:flex tw:items-center tw:justify-end">
        <div class="tw:flex tw:items-center tw:gap-4">
          <BaseButton variant="secondary" :isLoading="saving" @click="cancel"> Cancel </BaseButton>
          <BaseButton variant="primary" :isLoading="saving" @click="saveDraft">
            Create Document
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- AI draft dialog (Phase 4) -->
    <DocumentDraftDialog
      v-model="showDraftDialog"
      :initialDocumentTypeId="form.documentTypeId"
      :initialDepartmentName="aiDepartmentName"
      @apply="handleAiDraft"
    />

    <!-- PDF import dialog — extract text + images and structure with AI -->
    <DocumentImportPdfDialog v-model="showImportDialog" @apply="handlePdfImport" />
  </BasePage>
</template>
