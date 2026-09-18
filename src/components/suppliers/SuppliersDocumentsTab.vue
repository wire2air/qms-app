<script setup>
/**
 * Documents tab on the admin Supplier detail page.
 *
 * One source of truth for files we have on file for this supplier:
 *  - rows with request_id set were collected via the asset_request flow
 *    (supplier uploaded through the portal / token link).
 *  - rows with request_id null are ad-hoc — the admin attached a file
 *    the supplier sent offline (email, in-person, etc).
 *
 * Both kinds live in supplier_assets. The badge in the right column makes
 * the source visible at a glance.
 */
import {
  IconFileDescription,
  IconExternalLink,
  IconUpload,
  IconTrash,
  IconPaperclip,
  IconClipboardList,
} from '@tabler/icons-vue'
import { upload } from '@/api' // Action RPC — see CLAUDE.md rule #4 exception.
import { isAllowed } from '@/utils/currentSession.js'
import { required, requiredWhen } from '@shared/components/form/validators.js'
import { REMINDER_WINDOWS_DAYS, toExpiryIso } from './certificateExpiry.js'

const props = defineProps({
  supplier: {
    type: Object,
    required: true,
  },
})

const toast = useToast()
const { confirm } = useConfirm()
const canUpdate = computed(() => isAllowed(['supplier_management:update']))

// Mirrors the RLS policy on supplier_certificate_types (database/rls.sql):
//   manage OR supplier_management:read (owners bypass, inside isAllowed).
// Two calls because isAllowed AND-s the array it is given. When neither grant
// is held the dropdown is hidden rather than shown empty — the reader would
// otherwise see "no certificate types" and conclude the tenant has none.
// Expiry stays available either way: the backend derives is_certificate from
// expires_at alone, and the cron LEFT JOINs the type, so an untyped cert with
// an expiry is a complete, notifiable row.
const canReadCertificateTypes = computed(
  () => isAllowed(['supplier_certificate_types:manage']) || isAllowed(['supplier_management:read']),
)

const supplierAssets = useLiveQueryWithDeps(
  [() => props.supplier?.id],
  async (db, [supplierId]) => {
    if (!supplierId) return []
    const rows = await db.SupplierAsset.where('supplierId', supplierId).exec()
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },

  { models: ['SupplierAsset'], initial: [] },
)

const documents = useLiveQueryWithDeps(
  [() => supplierAssets.value],
  async (db, [assets]) => {
    if (!assets?.length) return []
    const results = await Promise.all(
      assets.map(async (sa) => {
        const asset = sa.assetId ? await db.Asset.findByPk(sa.assetId) : null
        return { row: sa, asset }
      }),
    )
    return results
  },
  { initial: [], models: ['SupplierAsset', 'Asset'] },
)

const typeLabel = {
  certificate: 'Certificate',
  license: 'License',
  OTHER: 'Other',
}

function displayTitle(d) {
  return d.row.title || d.asset?.originalFilename || d.asset?.filename || 'Document'
}

// ─── Upload dialog ────────────────────────────────────────────────────
//
// SUP-F5. The two certificate fields are shown ALWAYS, not behind an "is this
// a certificate?" toggle. Reasons, in order of weight:
//
//  1. There is no isCertificate to collect. The endpoint derives it as
//     `!!expiresAt` and refuses to trust a client flag, precisely so that
//     "flagged as a certificate but with no expiry" — a state the reminder
//     query cannot act on — is unrepresentable. A checkbox would put that
//     state back in the UI, where a user could sit in it and wonder why the
//     Upload button won't take.
//  2. Discoverability is the actual defect. The reminder engine shipped in
//     2026-05 and has never fired for a real row because nothing in the app
//     ever mentioned expiry. Hiding the fields one click deeper reproduces
//     that failure in miniature; a visible empty "Expires" field with a hint
//     naming the reminder schedule is what tells someone the feature exists.
//  3. It costs nothing. The dialog goes from four fields to six, all optional
//     bar the two that already were required. Progressive disclosure earns
//     its complexity on long forms, not here.
//
// The one rule that IS enforced client-side is the server's refinement:
// expiresAt is required when certificateTypeId is set. Enforced with
// requiredWhen so the user is corrected inline instead of by a 400.
function emptyUploadForm() {
  return {
    title: '',
    description: '',
    documentType: 'OTHER',
    file: null,
    certificateTypeId: null,
    expiresAt: null,
  }
}

const showUpload = ref(false)
const uploadForm = ref(emptyUploadForm())
const uploading = ref(false)
const fileInput = ref(null)
const uploadFormRef = ref(null)

function openUpload() {
  if (!canUpdate.value) return
  uploadForm.value = emptyUploadForm()
  showUpload.value = true
}

// Spells the cron's actual schedule out on the field rather than saying a
// vague "we'll remind you" — built from the same constant the pill bands come
// from, so it cannot drift from what the worker does.
const expiryHint = computed(() => {
  const ahead = REMINDER_WINDOWS_DAYS.filter((d) => d > 0).sort((a, b) => b - a)
  return `Setting a date makes this a tracked certificate. Renewal reminders go to you and the company owner ${ahead.join(' and ')} days before it lapses, and again on the day.`
})

function pickFile() {
  fileInput.value?.click()
}
function onFile(e) {
  uploadForm.value.file = e.target.files?.[0] || null
}

function submitUpload() {
  uploadFormRef.value?.submit()
}

async function onValidSubmit() {
  if (uploading.value) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', uploadForm.value.file)
    fd.append('title', uploadForm.value.title.trim())
    if (uploadForm.value.description.trim()) {
      fd.append('description', uploadForm.value.description.trim())
    }
    fd.append('documentType', uploadForm.value.documentType || 'OTHER')
    // Both optional and both omitted when empty — the schema is
    // .optional().nullable() and an empty form field would arrive as the
    // string '' and fail the uuid / datetime checks.
    if (uploadForm.value.certificateTypeId) {
      fd.append('certificateTypeId', uploadForm.value.certificateTypeId)
    }
    const expiresAtIso = toExpiryIso(uploadForm.value.expiresAt)
    if (expiresAtIso) fd.append('expiresAt', expiresAtIso)
    await upload(`/v1/services/suppliers/${props.supplier.id}/documents`, fd)
    toast.success('Document uploaded')
    showUpload.value = false
  } catch (err) {
    toast.error(err?.message || 'Upload failed')
  } finally {
    uploading.value = false
  }
}

async function removeDoc(d) {
  if (!canUpdate.value) return
  if (
    !(await confirm({
      title: 'Remove document',
      message: `Remove "${displayTitle(d)}" from this supplier?`,
      okLabel: 'Remove',
      danger: true,
    }))
  ) {
    return
  }
  try {
    await d.row.delete()
    toast.success('Removed')
  } catch (err) {
    toast.error(err?.message || 'Failed to remove')
  }
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} bytes`
}
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden"
  >
    <div
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between tw:gap-3"
    >
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-gray-100 tw:flex tw:items-center tw:justify-center"
        >
          <IconFileDescription :size="20" class="tw:text-secondary" />
        </div>
        <h3 class="tw:text-lg tw:font-semibold tw:text-on-main">Documents</h3>
        <span
          v-if="documents.length"
          class="tw:inline-flex tw:items-center tw:justify-center tw:rounded-full tw:bg-gray-200 tw:text-gray-700 tw:px-2 tw:py-0.5 tw:text-micro tw:font-bold"
          >{{ documents.length }}</span
        >
      </div>
      <BaseButton v-if="canUpdate" variant="primary" size="sm" @click="openUpload">
        <IconUpload :size="14" />
        Upload document
      </BaseButton>
    </div>

    <div v-if="documents.length" class="tw:divide-y tw:divide-divider">
      <div
        v-for="d in documents"
        :key="d.row.id"
        class="tw:p-4 tw:flex tw:items-center tw:gap-4 tw:hover:bg-main-hover tw:transition-colors"
      >
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-primary/10 tw:flex tw:items-center tw:justify-center tw:shrink-0"
        >
          <IconFileDescription :size="20" class="tw:text-primary" />
        </div>
        <div class="tw:flex-1 tw:min-w-0">
          <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
            <p class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">
              {{ displayTitle(d) }}
            </p>
            <span
              v-if="d.row.requestId"
              class="tw:inline-flex tw:items-center tw:gap-1 tw:text-micro tw:rounded tw:bg-blue-50 tw:text-blue-700 tw:px-1.5 tw:py-0.5"
            >
              <IconClipboardList :size="10" />
              via request
            </span>
            <span
              v-else
              class="tw:inline-flex tw:items-center tw:gap-1 tw:text-micro tw:rounded tw:bg-amber-50 tw:text-amber-700 tw:px-1.5 tw:py-0.5"
            >
              <IconPaperclip :size="10" />
              ad-hoc
            </span>
            <!-- Cert type is optional even on a tracked cert (the reminder
                 query LEFT JOINs it), so the two render independently. -->
            <SupplierCertificateTypeBadgeById
              v-if="d.row.certificateTypeId"
              :certificateTypeId="d.row.certificateTypeId"
            />
            <ExpiryPill v-if="d.row.expiresAt" :expiresAt="d.row.expiresAt" />
          </div>
          <p v-if="d.row.description" class="tw:text-xs tw:text-secondary tw:mt-0.5">
            {{ d.row.description }}
          </p>
          <p class="tw:text-xs tw:text-secondary tw:mt-0.5">
            {{ typeLabel[d.row.documentType] || d.row.documentType }}
            <span v-if="d.asset?.fileSize" class="tw:ml-1"
              >· {{ formatSize(d.asset.fileSize) }}</span
            >
            <span v-if="d.row.createdAt" class="tw:ml-1">
              · added {{ d.row.createdAt.toRelative?.() }}
            </span>
            <span v-if="d.row.expiresAt" class="tw:ml-1">
              · expires {{ d.row.expiresAt.formatDate?.('date') }}
            </span>
          </p>
        </div>
        <a
          v-if="d.asset?.url"
          :href="d.asset.url"
          target="_blank"
          class="tw:p-1 tw:rounded tw:text-secondary tw:hover:text-primary tw:transition-colors"
          title="Open document"
        >
          <IconExternalLink :size="16" />
        </a>
        <button
          v-if="canUpdate"
          class="tw:p-1 tw:rounded tw:text-red-400 tw:hover:text-red-600 tw:hover:bg-red-50 tw:transition-colors"
          title="Remove document"
          @click="removeDoc(d)"
        >
          <IconTrash :size="16" />
        </button>
      </div>
    </div>

    <BaseEmptyState
      v-else
      :icon="IconFileDescription"
      title="No documents on file for this supplier."
      description="Upload one directly, or request it through the Asset Requests tab."
    />

    <!-- Ad-hoc upload dialog -->
    <BaseDialog v-model="showUpload" title="Upload supplier document" size="md">
      <BaseForm ref="uploadFormRef" hideFooter @submit="onValidSubmit">
        <div class="tw:p-4 tw:flex tw:flex-col tw:gap-3">
          <BaseField
            v-slot="{ id: fieldId }"
            label="Title"
            required
            :value="uploadForm.title"
            :rules="[required()]"
          >
            <BaseTextInput
              :id="fieldId"
              v-model="uploadForm.title"
              placeholder="e.g. ISO 9001 Certificate"
            />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Description" optional>
            <BaseTextarea
              :id="fieldId"
              v-model="uploadForm.description"
              :rows="2"
              placeholder="What is this document, what does it cover, when was it issued?"
            />
          </BaseField>
          <BaseField
            label="File"
            required
            :value="uploadForm.file"
            :rules="[required('Pick a file first.')]"
          >
            <BaseClickableRow
              v-if="!uploadForm.file"
              class="tw:border-2 tw:border-dashed tw:border-divider tw:rounded-lg tw:p-6 tw:text-center tw:hover:border-primary tw:transition-colors"
              aria-label="Select a file to upload"
              @click="pickFile"
            >
              <IconUpload :size="28" class="tw:text-secondary tw:mx-auto" />
              <p class="tw:text-xs tw:text-secondary tw:mt-1">Click to select a file</p>
            </BaseClickableRow>
            <div
              v-else
              class="tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:flex tw:items-center tw:gap-3"
            >
              <IconFileDescription :size="24" class="tw:text-primary" />
              <div class="tw:flex-1 tw:min-w-0">
                <div class="tw:text-sm tw:text-on-main tw:truncate">{{ uploadForm.file.name }}</div>
                <div class="tw:text-xs tw:text-secondary">
                  {{ formatSize(uploadForm.file.size) }}
                </div>
              </div>
              <button
                class="tw:text-xs tw:text-secondary tw:hover:text-on-main tw:bg-transparent tw:border-0 tw:cursor-pointer"
                @click="uploadForm.file = null"
              >
                Remove
              </button>
            </div>
            <input
              ref="fileInput"
              type="file"
              class="tw:hidden"
              accept="image/*,application/pdf,.docx,.doc,.xlsx,.xls,.csv"
              @change="onFile"
            />
          </BaseField>

          <hr class="tw:border-divider" />

          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <BaseField
              v-if="canReadCertificateTypes"
              v-slot="field"
              label="Certificate type"
              optional
              hint="Classifies the certificate in reports and reminder emails."
            >
              <SupplierCertificateTypeSelectMenu
                v-bind="field"
                v-model="uploadForm.certificateTypeId"
                nullLabel="— Not a certificate —"
              />
            </BaseField>
            <BaseField
              v-slot="field"
              label="Expires"
              :required="!!uploadForm.certificateTypeId"
              :optional="!uploadForm.certificateTypeId"
              :value="uploadForm.expiresAt"
              :rules="[
                requiredWhen(
                  () => !!uploadForm.certificateTypeId,
                  'A certificate type needs an expiry date — that is what the reminders key off.',
                ),
              ]"
              :hint="expiryHint"
            >
              <BaseDateField v-bind="field" v-model="uploadForm.expiresAt" mode="date" clearable />
            </BaseField>
          </div>
        </div>
      </BaseForm>
      <template #footer>
        <BaseDialogFooter
          submitLabel="Upload"
          :loading="uploading"
          @cancel="showUpload = false"
          @submit="submitUpload"
        />
      </template>
    </BaseDialog>
  </div>
</template>
