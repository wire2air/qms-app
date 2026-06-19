<script setup>
/**
 * Audit Standard detail page.
 *
 * Layout: header with name + breadcrumb + code + status + version
 * badge, main area carries the requirements editor (when there's an
 * editable DRAFT), right rail shows metadata. Inline auto-save for
 * the parent metadata fields (name + description) on the standard
 * row itself, mirroring the NC / CAPA / CR detail page pattern.
 *
 * Version lifecycle (DRAFT → UNDER_REVIEW → EFFECTIVE → REJECTED →
 * SUPERSEDED) is driven through the unified workflow engine via
 * AuditStandardVersionSubmitDialog (submit for approval) +
 * POST /auditStandards/:id/versions (spawn new draft off effective).
 * DRAFT/REJECTED versions can be discarded; everything else is
 * read-only here and managed by the engine.
 */
import {
  IconClipboardList,
  IconClipboardCheck,
  IconArrowBack,
  IconPlus,
  IconSend,
  IconTrash,
  IconFile,
  IconUpload,
  IconDownload,
  IconX,
  IconCopy,
} from '@tabler/icons-vue'
import { isAllowed, currentSession } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { post, patch, del } from '@/api'

const props = defineProps({
  id: { type: String, required: true },
})

const toast = useToast()
const router = useRouter()

const standard = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => db.AuditStandard.findByPk(id),
  { models: ['AuditStandard'] },
)
const loading = computed(() => standard.value === undefined)

const canUpdate = computed(() => isAllowed(['auditStandards:update']))
const canDelete = computed(() => isAllowed(['auditStandards:delete']))
const canCreate = computed(() => isAllowed(['auditStandards:create']))
const showCloneDialog = ref(false)
const isOwner = computed(() => !!currentSession.value?.isOwner)
const isEditable = computed(() => canUpdate.value || isOwner.value)

// ─── Versions for this standard ─────────────────────────────────────
const versions = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [standardId]) => {
    if (!standardId) return []
    const rows = await db.AuditStandardVersion.where('auditStandardId', standardId).exec()
    return rows.sort((a, b) => {
      const av = (a.versionMajor ?? 0) * 1000 + (a.versionMinor ?? 0)
      const bv = (b.versionMajor ?? 0) * 1000 + (b.versionMinor ?? 0)
      return bv - av
    })
  },

  { models: ['AuditStandardVersion'], initial: [] },
)
const effectiveVersion = computed(() => versions.value.find((v) => v.statusId === 'EFFECTIVE'))
const draftVersion = computed(() => versions.value.find((v) => v.statusId === 'DRAFT'))
const editableVersion = computed(
  () => draftVersion.value ?? versions.value.find((v) => v.statusId === 'REJECTED'),
)
// Currently under review — when set, surfaces the approval workflow
// card with Approve / Reject buttons. Exactly one row at a time
// (BE submit endpoint refuses concurrent submits).
const underReviewVersion = computed(() =>
  versions.value.find((v) => v.statusId === 'UNDER_REVIEW' && v.workflowInstanceId),
)

const activeVersion = computed(
  () => editableVersion.value ?? effectiveVersion.value ?? versions.value[0] ?? null,
)

function versionBadgeClass(status) {
  switch (status) {
    case 'DRAFT':
      return 'tw:bg-gray-100 tw:text-gray-700'
    case 'UNDER_REVIEW':
      return 'tw:bg-amber-100 tw:text-amber-700'
    case 'EFFECTIVE':
      return 'tw:bg-emerald-100 tw:text-emerald-700'
    case 'REJECTED':
      return 'tw:bg-red-100 tw:text-red-700'
    case 'SUPERSEDED':
      return 'tw:bg-purple-100 tw:text-purple-700'
    default:
      return 'tw:bg-gray-100 tw:text-gray-600'
  }
}

// ─── Inline metadata editing (auto-save via PATCH /v1/services/auditStandards/:id) ──
const isFirstLoad = ref(true)
const saving = ref(false)
const saveError = ref(null)

const debouncedSave = useDebounceFn(async () => {
  if (!standard.value) return
  if (!isEditable.value) return
  saving.value = true
  saveError.value = null
  try {
    await patch(`/v1/services/auditStandards/${standard.value.id}`, {
      name: standard.value.name,
      description: standard.value.description ?? null,
      auditStandardTypeId: standard.value.auditStandardTypeId ?? null,
    })
  } catch (e) {
    saveError.value = e.message || 'Failed to save'
    toast.error(saveError.value)
  } finally {
    saving.value = false
  }
}, 500)

watch(
  standard,
  () => {
    if (isFirstLoad.value) {
      isFirstLoad.value = false
      return
    }
    if (standard.value) debouncedSave()
  },
  { deep: true },
)

// ─── Click-to-edit toggles ───────────────────────────────────────────
const editingName = ref(false)
const editingDescription = ref(false)

// ─── Delete ─────────────────────────────────────────────────────────
const showDeleteDialog = ref(false)
// Full per-entity audit log — includes every version's workflow
// activity (reject reasons, reassigns, approvals) plus all metadata
// updates to the standard itself.
const showAuditLog = ref(false)
const deleting = ref(false)

async function handleDelete() {
  if (!standard.value?.id) return
  deleting.value = true
  try {
    await standard.value.delete()
    toast.success('Standard archived')
    showDeleteDialog.value = false
    router.push(getCompanyPath('/audits?tab=standards'))
  } catch (e) {
    toast.error(e.message || 'Failed to archive standard')
  } finally {
    deleting.value = false
  }
}

// ─── Version lifecycle actions ─────────────────────────────────────
// Three operations live here (the engine owns approve/reject/send-back
// via the task-action surface):
//   1. Submit DRAFT/REJECTED → UNDER_REVIEW (via the picker dialog).
//   2. Spawn a new DRAFT off the current EFFECTIVE (only valid when
//      there's an EFFECTIVE and no editable draft is already open).
//   3. Discard a DRAFT/REJECTED (hard-delete, only allowed when there's
//      an EFFECTIVE to fall back to).
const showSubmitDialog = ref(false)
const submitTargetVersionId = ref(null)
const spawningDraft = ref(false)
const discardTarget = ref(null)
const discarding = ref(false)

const canSubmitEditable = computed(() => {
  return !!editableVersion.value && isEditable.value && !!standard.value?.workflowVersionId
})
// Spawn new draft only when there IS an effective and no editable draft yet.
const canSpawnNewDraft = computed(() => {
  if (!isEditable.value) return false
  if (!effectiveVersion.value) return false
  if (editableVersion.value) return false
  if (versions.value.some((v) => v.statusId === 'UNDER_REVIEW')) return false
  return true
})

function openSubmitDialog(versionId) {
  submitTargetVersionId.value = versionId
  showSubmitDialog.value = true
}

async function spawnNewDraft() {
  if (!standard.value?.id || spawningDraft.value) return
  spawningDraft.value = true
  try {
    await post(`/v1/services/auditStandards/${standard.value.id}/versions`, {})
    toast.success('New draft created')
  } catch (e) {
    toast.error(e.message || 'Failed to create new draft')
  } finally {
    spawningDraft.value = false
  }
}

// ─── License attestation ─────────────────────────────────────────
const showAttestDialog = ref(false)
const attestForm = ref({
  acknowledged: false,
  customerLicenseReference: '',
  customerLicenseExpiresAt: '',
})
const attesting = ref(false)

watch(showAttestDialog, (open) => {
  if (open) {
    attestForm.value = {
      acknowledged: false,
      customerLicenseReference: standard.value?.customerLicenseReference ?? '',
      customerLicenseExpiresAt: standard.value?.customerLicenseExpiresAt
        ? typeof standard.value.customerLicenseExpiresAt === 'string'
          ? standard.value.customerLicenseExpiresAt
          : (standard.value.customerLicenseExpiresAt.toFormat?.('yyyy-LL-dd') ?? '')
        : '',
    }
  }
})

async function confirmAttest() {
  if (!standard.value?.id || !attestForm.value.acknowledged || attesting.value) return
  attesting.value = true
  try {
    await post(`/v1/services/auditStandards/${standard.value.id}/attest`, {
      acknowledged: true,
      customerLicenseReference: attestForm.value.customerLicenseReference?.trim() || null,
      customerLicenseExpiresAt: attestForm.value.customerLicenseExpiresAt || null,
    })
    toast.success('License attested')
    showAttestDialog.value = false
  } catch (e) {
    toast.error(e.message || 'Failed to record attestation')
  } finally {
    attesting.value = false
  }
}

async function confirmDiscardVersion() {
  if (!discardTarget.value?.id || discarding.value) return
  discarding.value = true
  try {
    await del(`/v1/services/auditStandardVersions/${discardTarget.value.id}`)
    toast.success('Draft discarded')
    discardTarget.value = null
  } catch (e) {
    toast.error(e.message || 'Failed to discard draft')
  } finally {
    discarding.value = false
  }
}

// ─── Source document attachment ────────────────────────────────────
// The standard can carry one Asset reference to the original source
// document (PDF / Excel / CSV) — set automatically by AI Assist Import
// and editable here. The Asset row's `url` already holds either a
// signed URL (private bucket) or a /api/v1/files/... path the FE can
// link to directly.
const sourceAsset = useLiveQueryWithDeps(
  [() => standard.value?.sourceAssetId],

  async (db, [assetId]) => {
    if (!assetId) return null
    return db.Asset.findByPk(assetId)
  },
  { models: ['Asset'] },
)
const sourceFileInputRef = ref(null)
const uploadingSourceFile = ref(false)

async function handleSourceFilePicked(event) {
  const file = event.target.files?.[0]
  if (event.target) event.target.value = ''
  if (!file || !standard.value?.id || uploadingSourceFile.value) return
  uploadingSourceFile.value = true
  try {
    const form = new FormData()
    form.append('file', file, file.name)
    await post(`/v1/services/auditStandards/${standard.value.id}/sourceFile`, form, {
      timeout: 2 * 60_000,
    })
    toast.success('Source document attached')
  } catch (e) {
    toast.error(e?.message || 'Failed to attach source document')
  } finally {
    uploadingSourceFile.value = false
  }
}

const removingSourceFile = ref(false)
async function handleRemoveSourceFile() {
  if (!standard.value || removingSourceFile.value) return
  removingSourceFile.value = true
  try {
    // Clear the FK via the standard PATCH endpoint — the actual asset
    // row is left in place (other entities might reference it; the
    // upload service handles asset cleanup on its own schedule).
    await patch(`/v1/services/auditStandards/${standard.value.id}`, { sourceAssetId: null })
    toast.success('Source document unlinked')
  } catch (e) {
    toast.error(e?.message || 'Failed to unlink source document')
  } finally {
    removingSourceFile.value = false
  }
}
</script>

<template>
  <BasePage width="standard" fullHeight>
    <PageHeader :icon="IconClipboardCheck">
      <template #title>{{ standard?.name || standard?.code || 'Standard' }}</template>
      <template #actions>
        <BaseButton
          v-if="standard"
          variant="outline"
          size="sm"
          @click="router.push(getCompanyPath('/audits?tab=standards'))"
        >
          <IconArrowBack :size="16" class="tw:mr-1" />
          Back
        </BaseButton>
        <BaseButton
          v-if="canCreate && standard"
          variant="outline"
          size="sm"
          @click="showCloneDialog = true"
        >
          <IconCopy :size="16" class="tw:mr-1" />
          Duplicate
        </BaseButton>
        <BaseButton
          v-if="canSubmitEditable && editableVersion"
          variant="primary"
          size="sm"
          @click="openSubmitDialog(editableVersion.id)"
        >
          <IconSend :size="16" class="tw:mr-1" />
          Submit for Approval
        </BaseButton>
        <BaseButton
          v-if="canSpawnNewDraft"
          variant="outline"
          size="sm"
          :disabled="spawningDraft"
          @click="spawnNewDraft"
        >
          <IconPlus :size="16" class="tw:mr-1" />
          {{ spawningDraft ? 'Creating…' : 'New Draft' }}
        </BaseButton>
        <BaseButton v-if="standard" variant="secondary" size="sm" @click="showAuditLog = true">
          <IconClipboardCheck :size="16" class="tw:mr-1" />
          Audit Log
        </BaseButton>
        <BaseButton
          v-if="canDelete && standard"
          variant="danger"
          size="sm"
          :disabled="deleting"
          @click="showDeleteDialog = true"
        >
          Delete
        </BaseButton>
      </template>
    </PageHeader>

    <div v-if="loading" class="tw:flex tw:items-center tw:justify-center tw:h-full">
      <BaseSpinner size="lg" />
    </div>

    <BaseEmptyState
      v-else-if="!standard"
      title="Standard not found"
      description="This audit standard could not be found."
    />

    <div v-else class="tw:overflow-y-auto tw:flex-1 tw:min-h-0">
      <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
        <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-[1fr_280px] tw:gap-4 tw:items-start">
          <!-- Left column -->
          <div class="tw:flex tw:flex-col tw:gap-4">
            <!-- Details card -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <BaseText
                variant="overline"
                class="tw:block tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                Standard Details
              </BaseText>

              <BaseTextInput
                v-if="editingName && isEditable"
                v-model="standard.name"
                placeholder="Standard name"
                autofocus
                class="tw:mb-2"
                @blur="editingName = false"
              />
              <BaseClickableRow
                v-else
                class="tw:text-base tw:font-semibold tw:text-on-main tw:mb-2"
                :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                :disabled="!isEditable"
                aria-label="Edit standard name"
                @click="isEditable && (editingName = true)"
              >
                {{ standard.name }}
              </BaseClickableRow>

              <div v-if="editingDescription && isEditable" class="tw:mb-4">
                <BaseTextarea
                  v-model="standard.description"
                  :rows="3"
                  placeholder="Optional description"
                  @blur="editingDescription = false"
                />
              </div>
              <BaseClickableRow
                v-else
                class="tw:mb-4 tw:text-sm tw:text-secondary tw:leading-relaxed"
                :class="isEditable ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
                :disabled="!isEditable"
                aria-label="Edit standard description"
                @click="isEditable && (editingDescription = true)"
              >
                {{ standard.description || (isEditable ? 'Add a description…' : '—') }}
              </BaseClickableRow>

              <div class="tw:grid tw:grid-cols-2 tw:gap-3">
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Type</div>
                  <AuditStandardTypeSelectMenu
                    v-if="isEditable"
                    v-model="standard.auditStandardTypeId"
                  />
                  <AuditStandardTypeBadgeById
                    v-else-if="standard.auditStandardTypeId"
                    :standardTypeId="standard.auditStandardTypeId"
                  />
                  <span v-else class="tw:text-sm tw:text-secondary">—</span>
                </div>
                <div class="tw:flex tw:flex-col tw:gap-1">
                  <div class="tw:text-xs tw:text-secondary">Effective</div>
                  <span class="tw:text-sm tw:font-medium">
                    {{ standard.effectiveDate ? standard.effectiveDate.formatDate('date') : '—' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Approval Workflow — appears when a version is
                 UNDER_REVIEW (i.e. has been submitted via
                 AuditStandardVersionSubmitDialog). Reviewers see
                 Approve / Reject buttons inside each step card via
                 the unified WorkflowStep component. On approval the
                 auditStandardVersionHandler flips the version to
                 EFFECTIVE; on rejection it goes back to REJECTED so
                 the author can amend + resubmit. -->
            <div
              v-if="underReviewVersion"
              class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5"
            >
              <BaseText
                variant="overline"
                class="tw:pb-3 tw:border-b tw:border-divider tw:mb-4 tw:flex tw:items-center tw:gap-2"
              >
                Approval Workflow
                <span class="tw:font-normal tw:normal-case tw:text-secondary tw:ml-1">
                  v{{ underReviewVersion.versionMajor }}.{{ underReviewVersion.versionMinor }}
                </span>
              </BaseText>
              <AuditStandardVersionWorkflowDetail
                :versionId="underReviewVersion.id"
                :workflowInstanceId="underReviewVersion.workflowInstanceId"
                :isOwner="underReviewVersion.createdBy === currentSession?.userId"
              />
            </div>

            <!-- Requirements editor (or read-only view) -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
              <div
                class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
              >
                <BaseText variant="overline">
                  Requirements
                  <span
                    v-if="activeVersion"
                    class="tw:font-normal tw:normal-case tw:text-secondary tw:ml-2"
                  >
                    v{{ activeVersion.versionMajor }}.{{ activeVersion.versionMinor }}
                  </span>
                </BaseText>
                <span
                  v-if="activeVersion"
                  class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-2 tw:py-0.5"
                  :class="versionBadgeClass(activeVersion.statusId)"
                >
                  {{ activeVersion.statusId }}
                </span>
              </div>

              <AuditRequirementsEditor
                v-if="editableVersion && isEditable"
                :version="editableVersion"
              />
              <AuditRequirementsEditor
                v-else-if="activeVersion"
                :version="activeVersion"
                readonly
              />
              <div v-else class="tw:py-12 tw:text-center tw:text-sm tw:text-secondary tw:italic">
                No version yet — try creating a new draft.
              </div>
            </div>
          </div>

          <!-- Right column / Overview -->
          <div class="tw:flex tw:flex-col tw:gap-3">
            <BaseOverviewPanel>
              <BaseDetailSection title="General">
                <BaseDetailField label="Code">
                  <code
                    class="tw:text-xs tw:font-mono tw:text-on-main tw:bg-main-hover tw:px-2 tw:py-0.5 tw:rounded"
                  >
                    {{ standard.code }}
                  </code>
                </BaseDetailField>
                <BaseDetailField label="Status">
                  <BaseBadge
                    :class="
                      standard.statusId === 'ACTIVE'
                        ? 'tw:bg-emerald-100 tw:text-emerald-700'
                        : standard.statusId === 'INACTIVE'
                          ? 'tw:bg-gray-100 tw:text-gray-700'
                          : 'tw:bg-purple-100 tw:text-purple-700'
                    "
                  >
                    {{ standard.statusId }}
                  </BaseBadge>
                </BaseDetailField>
                <BaseDetailField label="Content">
                  <AuditStandardContentLicenseBadgeById :licenseId="standard.contentLicense" />
                </BaseDetailField>
                <BaseDetailField label="Versions">
                  <BaseText variant="body" weight="medium">{{ versions.length }}</BaseText>
                </BaseDetailField>
                <BaseDetailField
                  label="Created"
                  :value="standard.createdAt ? standard.createdAt.formatDate('date') : null"
                />
              </BaseDetailSection>

              <!-- License attestation — who confirmed the license + the attest
                   CTA when content isn't yet customer-licensed. -->
              <BaseDetailSection
                v-if="
                  standard.customerLicenseAttestedAt ||
                  (isEditable && standard.contentLicense !== 'CUSTOMER_LICENSED')
                "
                title="License"
                divided
              >
                <BaseDetailField v-if="standard.customerLicenseAttestedAt" label="Attested">
                  <BaseText variant="body" class="tw:flex tw:items-center tw:gap-1 tw:flex-wrap">
                    {{ standard.customerLicenseAttestedAt.formatDate?.('date') ?? '—' }}
                    <UserBadgeById
                      v-if="standard.customerLicenseAttestedBy"
                      :userId="standard.customerLicenseAttestedBy"
                    />
                  </BaseText>
                </BaseDetailField>
                <button
                  v-if="isEditable && standard.contentLicense !== 'CUSTOMER_LICENSED'"
                  type="button"
                  class="tw:text-caption tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0 tw:self-start"
                  @click="showAttestDialog = true"
                >
                  {{
                    standard.contentLicense === 'STRUCTURAL_SHELL'
                      ? 'I have a license for the normative text →'
                      : 'Attach a license →'
                  }}
                </button>
              </BaseDetailSection>

              <div v-if="saving" class="tw:text-caption tw:text-secondary tw:italic tw:pt-2">
                Saving…
              </div>
              <div v-else-if="saveError" class="tw:text-caption tw:text-red-600 tw:pt-2">
                {{ saveError }}
              </div>
            </BaseOverviewPanel>

            <!-- Source document — the original PDF / Excel / CSV the
                 structure was extracted from (or attached by hand for
                 standards created via Generate / paste import). Lets
                 auditors reference the source's normative guidance
                 since the imported requirements are structure-only. -->
            <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4">
              <BaseText
                variant="overline"
                class="tw:pb-2 tw:border-b tw:border-divider tw:mb-3 tw:flex tw:items-center tw:gap-2"
              >
                <IconFile :size="14" />
                Source Document
              </BaseText>

              <div v-if="sourceAsset" class="tw:flex tw:flex-col tw:gap-2">
                <a
                  :href="sourceAsset.url"
                  target="_blank"
                  rel="noopener"
                  class="tw:flex tw:items-start tw:gap-2 tw:text-xs tw:text-primary tw:hover:underline tw:break-all"
                  :title="sourceAsset.originalFilename || sourceAsset.filename"
                >
                  <IconDownload :size="14" class="tw:shrink-0 tw:mt-0.5" />
                  <span>{{ sourceAsset.originalFilename || sourceAsset.filename }}</span>
                </a>
                <div class="tw:text-micro tw:text-secondary tw:font-mono">
                  {{ sourceAsset.mimeType }} ·
                  {{ ((sourceAsset.fileSize || 0) / 1024).toFixed(1) }} KB
                </div>
                <div v-if="isEditable" class="tw:flex tw:gap-1 tw:mt-1">
                  <button
                    type="button"
                    class="tw:text-caption tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0 tw:disabled:opacity-50"
                    :disabled="uploadingSourceFile"
                    @click="sourceFileInputRef?.click()"
                  >
                    {{ uploadingSourceFile ? 'Replacing…' : 'Replace' }}
                  </button>
                  <span class="tw:text-micro tw:text-secondary">·</span>
                  <button
                    type="button"
                    class="tw:text-caption tw:text-red-600 tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0 tw:disabled:opacity-50"
                    :disabled="removingSourceFile"
                    @click="handleRemoveSourceFile"
                  >
                    <IconX :size="11" class="tw:inline" />
                    {{ removingSourceFile ? 'Removing…' : 'Remove' }}
                  </button>
                </div>
              </div>

              <div v-else class="tw:flex tw:flex-col tw:gap-2">
                <div class="tw:text-caption tw:text-secondary tw:italic">
                  No source document attached.
                </div>
                <button
                  v-if="isEditable"
                  type="button"
                  class="tw:text-caption tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0 tw:disabled:opacity-50 tw:flex tw:items-center tw:gap-1"
                  :disabled="uploadingSourceFile"
                  @click="sourceFileInputRef?.click()"
                >
                  <IconUpload :size="12" />
                  {{ uploadingSourceFile ? 'Uploading…' : 'Attach source file' }}
                </button>
              </div>

              <input
                ref="sourceFileInputRef"
                type="file"
                accept=".pdf,.csv,.txt,.tsv,.xlsx,.xls,application/pdf,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                class="tw:hidden"
                @change="handleSourceFilePicked"
              />
            </div>

            <!-- Versions list -->
            <div
              v-if="versions.length"
              class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-4"
            >
              <BaseText
                variant="overline"
                class="tw:pb-2 tw:border-b tw:border-divider tw:mb-3 tw:flex tw:items-center tw:gap-2"
              >
                <IconClipboardList :size="14" />
                Versions
              </BaseText>
              <div class="tw:flex tw:flex-col tw:gap-0.5">
                <div
                  v-for="v in versions"
                  :key="v.id"
                  class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:py-1.5 tw:text-xs tw:group"
                >
                  <span class="tw:font-mono tw:shrink-0">
                    v{{ v.versionMajor }}.{{ v.versionMinor }}
                  </span>
                  <div class="tw:flex tw:items-center tw:gap-1 tw:min-w-0">
                    <!-- Per-row actions appear on hover; only valid actions
                         render so there's no enabled-but-no-op affordance. -->
                    <button
                      v-if="
                        isEditable &&
                        (v.statusId === 'DRAFT' || v.statusId === 'REJECTED') &&
                        standard.workflowVersionId
                      "
                      type="button"
                      class="tw:opacity-0 tw:group-hover:opacity-100 tw:text-primary tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:text-micro"
                      title="Submit for approval"
                      @click="openSubmitDialog(v.id)"
                    >
                      Submit
                    </button>
                    <button
                      v-if="
                        isEditable &&
                        (v.statusId === 'DRAFT' || v.statusId === 'REJECTED') &&
                        !!effectiveVersion
                      "
                      type="button"
                      class="tw:opacity-0 tw:group-hover:opacity-100 tw:text-red-600 tw:hover:underline tw:bg-transparent tw:border-0 tw:cursor-pointer tw:text-micro"
                      title="Discard this draft"
                      @click="discardTarget = v"
                    >
                      <IconTrash :size="11" />
                    </button>
                    <span
                      class="tw:text-micro tw:font-semibold tw:uppercase tw:tracking-wide tw:rounded tw:px-1.5 tw:py-0.5 tw:shrink-0"
                      :class="versionBadgeClass(v.statusId)"
                    >
                      {{ v.statusId }}
                    </span>
                  </div>
                </div>
              </div>
              <div
                v-if="!standard.workflowVersionId"
                class="tw:text-micro tw:text-amber-700 tw:italic tw:pt-2 tw:border-t tw:border-divider tw:mt-2"
              >
                No approval workflow attached. Drafts can't be submitted until one is set.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AuditStandardCloneDialog v-model="showCloneDialog" :standard="standard" />

    <AuditStandardVersionSubmitDialog
      v-if="submitTargetVersionId"
      v-model="showSubmitDialog"
      :versionId="submitTargetVersionId"
      :workflowVersionId="standard?.workflowVersionId ?? null"
      @submitted="submitTargetVersionId = null"
    />

    <BaseDialog v-model="showAttestDialog" title="Attest License" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
        <div
          class="tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200 tw:p-3 tw:text-xs tw:text-amber-800"
        >
          By attesting, you confirm that your organization holds a valid license (typically from
          ANSI, ISO, SAE, or AIAG) to use the normative text of this standard within your QMS. The
          QMS does not embed the normative text itself; attestation is for your records + audit
          trail.
        </div>

        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            License Reference (optional)
          </p>
          <BaseTextInput
            v-model="attestForm.customerLicenseReference"
            placeholder="e.g. ANSI invoice #12345, AIAG site license SL-2026"
          />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            License Expires (optional)
          </p>
          <BaseTextInput v-model="attestForm.customerLicenseExpiresAt" type="date" />
        </div>

        <label class="tw:flex tw:items-start tw:gap-2 tw:cursor-pointer tw:text-xs">
          <input
            v-model="attestForm.acknowledged"
            type="checkbox"
            class="tw:mt-0.5 tw:cursor-pointer"
          />
          <span>
            I confirm that {{ currentSession?.firstName ?? 'my organization' }} holds a valid
            license to use this standard's normative text within our QMS, and that this attestation
            will be recorded with my user account and the current timestamp.
          </span>
        </label>
      </div>
      <template #footer>
        <BaseDialogFooter
          submitLabel="Attest"
          :loading="attesting"
          :disabled="!attestForm.acknowledged"
          @cancel="showAttestDialog = false"
          @submit="confirmAttest"
        />
      </template>
    </BaseDialog>

    <BaseDialog
      :modelValue="!!discardTarget"
      title="Discard Draft"
      maxWidth="md"
      @update:modelValue="discardTarget = null"
    >
      <p class="tw:text-sm tw:text-on-main tw:mb-3">
        Discard
        <strong v-if="discardTarget">
          v{{ discardTarget.versionMajor }}.{{ discardTarget.versionMinor }} </strong
        >? This permanently deletes the draft and its requirements. Existing EFFECTIVE / SUPERSEDED
        versions are untouched.
      </p>
      <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
        <BaseButton variant="outline" :disabled="discarding" @click="discardTarget = null">
          Cancel
        </BaseButton>
        <BaseButton variant="danger" :disabled="discarding" @click="confirmDiscardVersion">
          {{ discarding ? 'Discarding…' : 'Discard' }}
        </BaseButton>
      </div>
    </BaseDialog>

    <BaseDialog v-model="showDeleteDialog" title="Archive Standard" maxWidth="md">
      <p class="tw:text-sm tw:text-on-main tw:mb-3">
        Archive <strong>{{ standard?.name }}</strong
        >? Existing audit instances referencing this standard keep their reference and snapshot.
        Active audits filed against it stay valid; the standard just won't appear in pickers for new
        audits.
      </p>
      <p
        v-if="!canDelete"
        class="tw:text-xs tw:text-amber-700 tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded tw:p-2 tw:mb-3"
      >
        You don't have the auditStandards:delete permission. Soft-delete only.
      </p>
      <div class="tw:flex tw:justify-end tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
        <BaseButton variant="outline" :disabled="deleting" @click="showDeleteDialog = false">
          Cancel
        </BaseButton>
        <BaseButton variant="danger" :disabled="deleting" @click="handleDelete">
          {{ deleting ? 'Archiving…' : 'Archive' }}
        </BaseButton>
      </div>
    </BaseDialog>

    <!-- Full audit-log dialog. Includes the AuditStandard row itself
         plus every AuditStandardVersion underneath so the per-version
         approval activity (reject reasons, reassigns, e-signatures)
         is all in one place. -->
    <AuditLogDialog
      v-if="standard?.id"
      v-model="showAuditLog"
      entityType="AuditStandard"
      :entityId="standard.id"
      :title="`Audit Log — ${standard.name || 'Standard'}`"
      :includeEntities="
        versions.length
          ? [{ entityType: 'AuditStandardVersion', entityIds: versions.map((v) => v.id) }]
          : []
      "
    />
  </BasePage>
</template>
