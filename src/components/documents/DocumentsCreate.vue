<script setup>
import {
  IconFileText,
  IconInfoCircle,
  IconArticle,
  IconSchool,
  IconSparkles,
  IconFileUpload,
  IconPointFilled,
} from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { currentSession, canUseAi } from '@/utils/currentSession.js'
import { db } from '@models/index'
import { useUnsavedChangesGuard } from '@shared/composables/useUnsavedChangesGuard.js'

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
  curriculumIds: [],
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
  // Sites — one multi-select: where the document applies. appliesAllSites =
  // company-wide. The managing anchor (documents.siteId) is derived silently
  // at save (creator's site when selected, else the first selection).
  siteIds: [],
  appliesAllSites: false,
  tags: [],
  approverIds: [],
  periodicReviewMonths: 12,
  autoEffectiveOnApproval: true,
  relatedStandardId: null,
  prefix: null,
  trainingConfig: { ...DEFAULT_TRAINING_CONFIG },
}

// Form data — owner defaults to the creating user (the author can reassign it
// in the Properties tab before saving). No effective date: auto-release is on
// by default, and the date field only appears when you turn it off.
const form = ref({
  ...DEFAULT_FORM,
  ownerId: currentSession.value?.userId ?? null,
})

// Unsaved-changes marker for the footer + BaseForm's beforeunload guard.
const isDirty = ref(false)
watch(form, () => (isDirty.value = true), { deep: true })

// Confirm before abandoning a half-filled document via in-app navigation
// (Cancel, back, sidebar). allowLeave() is called before the post-save
// redirect so a successful create doesn't prompt. BaseForm covers the
// browser-level exit.
const { allowLeave } = useUnsavedChangesGuard(isDirty)

// The managing anchor: the creator's own site when it's among the selection
// (or when company-wide), else the first selected site. Invisible in the UI —
// ownership governs who can revise; the anchor only feeds site-scoped RLS and
// keeps a home for the document's numbering placeholders.
function deriveAnchorSiteId(formData, mySite) {
  if (formData.appliesAllSites) return mySite || formData.siteIds?.[0] || null
  const ids = formData.siteIds || []
  return mySite && ids.includes(mySite) ? mySite : ids[0] || null
}

const createDocument = useLiveMutation(async (db, formData) => {
  const me = await db.User.findByPk(currentSession.value?.userId ?? currentSession.value?.id)
  // The document number is NOT minted here. It's assigned by the backend when
  // the draft is first submitted for review (submitForReview controller), so a
  // draft that's deleted before submission never burns a sequence number that
  // auditors would flag as a gap. The prefix is stored on the document and the
  // counter is resolved/incremented server-side at submit time.
  const doc = db.Document.create({
    title: formData.title,
    documentTypeId: formData.documentTypeId,
    documentTemplateId: formData.documentTemplateId,
    departmentId: formData.departmentId,
    siteId: deriveAnchorSiteId(formData, me?.siteId || null),
    // Owner (accountable). Author defaults to the creator in the Document model.
    userId: formData.ownerId || currentSession.value?.userId,
    prefix: formData.prefix,
    relatedStandardId: formData.relatedStandardId,
    periodicReviewMonths: formData.periodicReviewMonths,
    autoEffectiveOnApproval: formData.autoEffectiveOnApproval,
    workflowVersionId: formData.workflowVersionId,
    statusId: 'ACTIVE',
    docNumber: null,
    appliesAllSites: !!formData.appliesAllSites,
  })
  await doc.save()

  // Applicability rows (skip for company-wide — the flag covers it).
  if (!formData.appliesAllSites) {
    for (const siteId of new Set(formData.siteIds || [])) {
      if (!siteId) continue
      const link = db.DocumentSite.create({ documentId: doc.id, siteId })
      await link.save()
    }
  }

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

/**
 * Save as Draft (user request 2026-08-15).
 *
 * "Create Document" runs the full field validation, so a half-filled form —
 * waiting on a department, a document type, a lookup someone still has to add
 * — could not be saved at all, and the work typed so far was lost on navigate.
 * The record it creates is identical (the version is DRAFT either way); this
 * path just skips the validations that only matter once you're ready to submit
 * for review, which is where the real gate belongs.
 *
 * Still required: a template and a title. Not a policy choice — the template
 * supplies prefix, workflow version and review period, all of which the
 * Document model requires, and title is NOT NULL at the database.
 */
const DRAFT_MINIMUM = [
  { key: 'documentTemplateId', label: 'Document Template' },
  { key: 'title', label: 'Document Title' },
]

const draftBlockers = computed(() =>
  DRAFT_MINIMUM.filter(({ key }) => {
    const v = form.value[key]
    return typeof v === 'string' ? !v.trim() : !v
  }).map(({ label }) => label),
)

async function onSaveDraft() {
  if (saving.value) return
  if (draftBlockers.value.length) {
    activeTab.value = 'properties'
    toast.warning(`Add ${draftBlockers.value.join(' and ')} before saving a draft`)
    return
  }
  await persist({ draft: true })
}

async function onSubmit() {
  // CustomFieldsCreateSection surfaces its own inline errors on validate() = false.
  if ((await customFieldsRef.value?.validate()) === false) {
    activeTab.value = 'properties'
    return
  }

  await persist({ draft: false })
}

// Shared by both save paths — they differ only in what was validated first.
async function persist({ draft }) {
  saving.value = true
  try {
    const doc = await createDocument({ ...form.value })
    if (doc) {
      // Persist custom fields against the new document (best-effort).
      try {
        await customFieldsRef.value?.persist(doc.id)
      } catch (cfErr) {
        toast.warning(
          cfErr?.message ||
            'Document saved, but custom fields could not be saved — add them on the document page',
        )
      }
      toast.success(
        draft
          ? 'Draft saved — finish the remaining details on the document page'
          : 'Document saved as draft',
      )
      form.value = { ...DEFAULT_FORM }
      allowLeave() // saved — don't prompt on the redirect
      router.push(getCompanyPath(`/documents/${doc.id}`))
    }
  } catch (error) {
    console.error('Error saving document:', error)
    toast.error(error?.message || 'Failed to save document. Please try again.')
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
    <div class="tw:flex-1 tw:min-h-0 tw:overflow-y-auto">
      <BaseForm
        :dirty="isDirty"
        :loading="saving"
        submitLabel="Create Document"
        @submit="onSubmit"
        @cancel="cancel"
      >
        <!-- Escape hatch from the full validation. Left of the primary action
             so "Create Document" stays the obvious path. This slot replaces the
             footer's own dirty marker, so it carries one too. -->
        <template #footer-status>
          <div class="tw:flex tw:items-center tw:gap-3">
            <BaseButton variant="outline" :disabled="saving" @click="onSaveDraft">
              Save as Draft
            </BaseButton>
            <span v-if="isDirty" class="tw:flex tw:items-center tw:gap-1.5 tw:text-secondary">
              <IconPointFilled
                :size="16"
                class="tw:shrink-0 tw:text-amber-500"
                aria-hidden="true"
              />
              Unsaved changes
            </span>
          </div>
        </template>
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
      </BaseForm>
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
