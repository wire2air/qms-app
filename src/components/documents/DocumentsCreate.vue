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
import { ensureAdHocApprovalVersionId } from './documentAdHocApproval.js'
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

// Site and Department default to the author's own (user request 2026-08-16).
// Most documents are written for the place the author works, and making them
// re-pick it every time was pure friction. Applied ONCE, and only to fields the
// author has not already touched, so a deliberate choice — or a template that
// filled something in — is never overwritten by a late-arriving user record.
const me = useLiveQuery(
  async (db) => {
    const id = currentSession.value?.userId ?? currentSession.value?.id
    return id ? db.User.findByPk(id) : null
  },
  { models: ['User'], initial: null },
)

// Unsaved-changes marker for the footer + BaseForm's beforeunload guard.
const isDirty = ref(false)
watch(form, () => (isDirty.value = true), { deep: true })

let defaultsApplied = false
watch(
  me,
  (u) => {
    if (!u || defaultsApplied) return
    defaultsApplied = true
    if (!form.value.siteIds?.length && u.siteId) form.value.siteIds = [u.siteId]
    if (!form.value.departmentId && u.departmentId) form.value.departmentId = u.departmentId
    // Seeding a default is not the author making a change.
    nextTick(() => (isDirty.value = false))
  },
  { immediate: true },
)

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

/** Trim, drop blanks, de-dupe — order preserved so the source id stays first. */
function normaliseTags(tags) {
  const seen = new Set()
  const out = []
  for (const raw of Array.isArray(tags) ? tags : []) {
    const t = String(raw ?? '').trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

const createDocument = useLiveMutation(async (db, formData) => {
  const me = await db.User.findByPk(currentSession.value?.userId ?? currentSession.value?.id)

  // No template → the ad-hoc approval flow, created on first use. Resolved
  // here rather than in the form because a company that onboarded before the
  // flow existed has none yet, and the form must not block on that: the
  // document is perfectly creatable, the flow just has to exist by save time.
  const workflowVersionId = formData.documentTemplateId
    ? formData.workflowVersionId
    : (formData.workflowVersionId ?? (await ensureAdHocApprovalVersionId(db)))
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
    workflowVersionId,
    statusId: 'ACTIVE',
    docNumber: null,
    appliesAllSites: !!formData.appliesAllSites,
    // form.tags existed but was dropped here — there was no column until
    // 20260816000300. Normalised: trimmed, de-duped, empties removed.
    tags: normaliseTags(formData.tags),
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
        // Snapshot the template's guidance onto the row. Without this the
        // instruction dies here — the template keeps it, the document never
        // sees it, which is exactly the bug it was reported as.
        instructions: section.instructions || null,
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
// Title only. "Create Document" requires a template again (2026-08-16), but a
// DRAFT deliberately does not — that is the point of the escape hatch, and a
// template-less draft is coherent: it takes its prefix from the form default
// and its workflow from the ad-hoc flow, both of which still exist. You pick
// the template on the document page before submitting.
const DRAFT_MINIMUM = [{ key: 'title', label: 'Document Title' }]

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
const departments = useLiveQuery((db) => db.Department.where().exec(), {
  models: ['Department'],
  initial: [],
})

/**
 * Apply what the importer read off the document's own header.
 *
 * Tag: the source system's identifier, verbatim. People migrating search for
 * the number they already know, not the one we are about to mint — and
 * search_reindex now folds tags into the FTS `structured` field so that works.
 *
 * Department: EXACT match, case-insensitive, per the decision on 2026-08-16.
 * Nothing fuzzier — "QA" resolving to "Quality Assurance" is a guess, and
 * silently filing a controlled document under the wrong department is worse
 * than leaving the author's own default in place. No match, no change.
 */
function applyImportedIdentity(draft) {
  const number = String(draft.sourceDocumentNumber ?? '').trim()
  if (number) {
    form.value.tags = normaliseTags([...(form.value.tags ?? []), number])
  }

  const name = String(draft.departmentName ?? '')
    .trim()
    .toLowerCase()
  if (!name) return
  const hit = (departments.value ?? []).find((d) => (d.name ?? '').trim().toLowerCase() === name)
  if (hit) form.value.departmentId = hit.id
}

const showImportDialog = ref(false)

// Set once an import has supplied this document's sections. From then on the
// template must not re-seed them: for an imported document the template's job
// is the approval flow, not the shape (user decision 2026-08-16). Without this
// flag, picking a template AFTER importing silently threw the import away.
const sectionsFromImport = ref(false)

// Matches the dialog's own label for the same section, so the fallback path
// and the structured path file the original PDF under one name.
const SOURCE_SECTION_TITLE = 'Source Document'

// The summary is model output being spliced into a rich-text section as HTML.
// A stray "<" would swallow the rest of the paragraph, so escape before
// wrapping — this is a content field, not a place to accept markup.
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function handlePdfImport(draft) {
  form.value.title = draft.title
  applyImportedIdentity(draft)
  // From here on the template no longer supplies this document's shape — the
  // imported file does. See the preserveSections prop on DocumentsCreateContent.
  sectionsFromImport.value = true

  // Fallback: the model could not structure the PDF. Summary plus the original
  // file, and deliberately NOT the template's sections — an empty controlled
  // shape nobody filled in is worse than an honest two-section record of what
  // was actually imported (user decision 2026-08-16).
  if (draft.attachment) {
    form.value.documentTemplateId = draft.documentTemplateId
    nextTick(() => {
      form.value.sections = [
        {
          id: crypto.randomUUID(),
          title: 'Summary',
          sectionType: 'text',
          content: draft.summary ? `<p>${escapeHtml(draft.summary)}</p>` : null,
          attachments: null,
          order: 1,
          isAddOn: true,
        },
        {
          id: crypto.randomUUID(),
          title: SOURCE_SECTION_TITLE,
          sectionType: 'attachment',
          content: null,
          attachments: [draft.attachment],
          order: 2,
          isAddOn: true,
        },
      ]
      activeTab.value = 'content'
      toast.success('PDF attached — review the document before saving.')
    })
    return
  }

  // Structured import. The document's OWN headings are the structure; the
  // selected template is not consulted for shape, only for the approval flow
  // (user decision 2026-08-16). The dialog has already appended the source PDF
  // as a final attachment section.
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
  if (draft.sourceAttachmentFailed) {
    toast.warning(
      "PDF imported, but the original file couldn't be attached — add it by hand if you need it.",
    )
  } else {
    toast.success('PDF imported — review each section before saving.')
  }
}

// Change Control is omitted on create — a brand-new document is always v1.0
// (a first draft) where change control doesn't apply. It appears on revisions.
const docTabs = [
  { value: 'properties', label: 'Properties', icon: IconInfoCircle },
  { value: 'content', label: 'Content', icon: IconArticle },
  { value: 'training', label: 'Training', icon: IconSchool },
]
</script>

<template>
  <BasePage width="standard" fullHeight class="tw:relative">
    <PageHeader :icon="IconFileText" title="Create Document">
      <template #actions>
        <!-- No longer AI-gated (user request 2026-08-16): without AI the
             dialog files the PDF as an attachment against a chosen template,
             which is useful on its own and is also the fallback when AI can't
             structure a file. -->
        <button
          class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-divider tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-sidebar tw:transition-colors tw:font-medium tw:px-3 tw:py-1.5 tw:text-sm"
          :title="
            canUseAi
              ? 'Import an existing PDF — extracts text + images and structures the content, or attaches it as-is'
              : 'Import an existing PDF and attach it to a document template'
          "
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
            <DocumentsCreateContent
              :form="form"
              :selectedTemplate="selectedTemplate"
              :preserveSections="sectionsFromImport"
            />
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
    <DocumentImportPdfDialog
      v-model="showImportDialog"
      :templateId="form.documentTemplateId"
      :existingSectionCount="form.sections?.length ?? 0"
      @apply="handlePdfImport"
    />
  </BasePage>
</template>
