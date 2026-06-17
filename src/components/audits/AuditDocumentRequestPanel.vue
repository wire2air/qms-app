<script setup>
/**
 * Document Request (PBC) panel — replaces the generic evidence box at audit
 * level. The auditor lists requested documents; the auditee/auditor uploads
 * files against a request, plus any add-on documents not tied to a request.
 *
 * - canManageRequests (auditor): add / remove request line items.
 * - readonly=false (auditor OR shared auditee): upload + remove files.
 *
 * Files are AuditEvidence rows at audit scope (no finding/response). A request
 * is "Provided" once ≥1 file points at it via auditDocumentRequestId.
 */
import {
  IconFile,
  IconTrash,
  IconExternalLink,
  IconUpload,
  IconPlus,
  IconCheck,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { del } from '@/api'

const props = defineProps({
  auditInstance: { type: Object, required: true },
  readonly: { type: Boolean, default: false },
  canManageRequests: { type: Boolean, default: false },
})

const toast = useToast()
const { confirm } = useConfirm()

// ── Request line items ─────────────────────────────────────────────
const requests = useLiveQueryWithDeps(
  [() => props.auditInstance.id],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.AuditDocumentRequest.where('auditInstanceId', id).exec()
    return rows.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
  },

  { models: ['AuditDocumentRequest'], initial: [] },
)

// ── Audit-scope evidence (uploads not bound to a finding/response) ──
const uploads = useLiveQueryWithDeps(
  [() => props.auditInstance.id],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.AuditEvidence.where('auditInstanceId', id).exec()
    return rows.filter((r) => !r.auditFindingId && !r.auditRequirementResponseId)
  },

  { models: ['AuditEvidence'], initial: [] },
)
const assetIdList = computed(() =>
  uploads.value
    .map((u) => u.assetId)
    .filter(Boolean)
    .join(','),
)
const assetsById = useLiveQueryWithDeps(
  [() => assetIdList.value],
  async (db, [csv]) => {
    if (!csv) return {}
    const wanted = new Set(csv.split(',').filter(Boolean))
    const rows = await db.Asset.where().exec()
    const map = {}
    for (const a of rows) if (wanted.has(a.id)) map[a.id] = a
    return map
  },

  { models: ['Asset'], initial: {} },
)

function filesFor(requestId) {
  return uploads.value.filter((u) => u.auditDocumentRequestId === requestId)
}
const addOns = computed(() => uploads.value.filter((u) => !u.auditDocumentRequestId))

function fileName(u) {
  const a = assetsById.value[u.assetId]
  return a?.originalFilename || a?.filename || 'Uploaded file'
}
function openAsset(u) {
  const a = assetsById.value[u.assetId]
  if (a?.url) window.open(a.url, '_blank')
}
async function removeUpload(u) {
  if (props.readonly) return
  if (
    !(await confirm({
      title: 'Remove document',
      message: 'Remove this document from the audit?',
      okLabel: 'Remove',
      danger: true,
    }))
  )
    return
  try {
    await del(`/v1/services/auditEvidence/${u.id}`)
    toast.success('Document removed')
  } catch (e) {
    toast.error(e.message || 'Failed to remove document')
  }
}

// ── Add a request (auditor) ────────────────────────────────────────
const newTitle = ref('')
const adding = ref(false)
const createRequest = useLiveMutation(async (db, { auditInstanceId, title, displayOrder }) => {
  const r = db.AuditDocumentRequest.create({ auditInstanceId, title, displayOrder })
  await r.save()
  return r
})
async function addRequest() {
  const title = newTitle.value.trim()
  if (!title || adding.value) return
  adding.value = true
  try {
    await createRequest({
      auditInstanceId: props.auditInstance.id,
      title,
      displayOrder: (requests.value.length + 1) * 10,
    })
    newTitle.value = ''
  } catch (e) {
    toast.error(e.message || 'Failed to add request')
  } finally {
    adding.value = false
  }
}
async function removeRequest(request) {
  if (!props.canManageRequests) return
  if (
    !(await confirm({
      title: 'Remove request',
      message: `Remove the request "${request.title}"? Uploaded files are kept as add-ons.`,
      okLabel: 'Remove',
      danger: true,
    }))
  )
    return
  try {
    await request.delete()
    toast.success('Request removed')
  } catch (e) {
    toast.error(e.message || 'Failed to remove request')
  }
}

// ── Upload dialog (shared; scoped to a request or as an add-on) ─────
const showUpload = ref(false)
const uploadScope = ref('audit')
const uploadScopeId = ref(null)
function openUpload(requestId) {
  uploadScope.value = requestId ? 'documentRequest' : 'audit'
  uploadScopeId.value = requestId ?? null
  showUpload.value = true
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <!-- Requested documents -->
    <div class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="req in requests"
        :key="req.id"
        class="tw:border tw:border-divider tw:rounded-lg tw:p-3"
      >
        <div class="tw:flex tw:items-start tw:gap-2">
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:flex tw:items-center tw:gap-2">
              <span class="tw:text-sm tw:font-medium tw:text-on-main">{{ req.title }}</span>
              <span
                class="tw:text-[10px] tw:font-bold tw:uppercase tw:rounded tw:px-1.5 tw:py-0.5 tw:inline-flex tw:items-center tw:gap-1"
                :class="
                  filesFor(req.id).length
                    ? 'tw:bg-emerald-100 tw:text-emerald-700'
                    : 'tw:bg-amber-100 tw:text-amber-700'
                "
              >
                <IconCheck v-if="filesFor(req.id).length" :size="11" />
                {{ filesFor(req.id).length ? 'Provided' : 'Requested' }}
              </span>
            </div>
            <p v-if="req.notes" class="tw:text-xs tw:text-secondary tw:mt-0.5">{{ req.notes }}</p>
          </div>
          <BaseButton v-if="!readonly" variant="outline" size="sm" @click="openUpload(req.id)">
            <template #icon><IconUpload :size="14" /></template>
            Upload
          </BaseButton>
          <button
            v-if="canManageRequests"
            type="button"
            class="tw:text-red-600 tw:hover:bg-red-50 tw:rounded tw:p-1.5 tw:cursor-pointer tw:bg-transparent tw:border-0"
            title="Remove request"
            @click="removeRequest(req)"
          >
            <IconTrash :size="14" />
          </button>
        </div>

        <!-- Files provided against this request -->
        <div
          v-if="filesFor(req.id).length"
          class="tw:mt-2 tw:flex tw:flex-col tw:divide-y tw:divide-divider"
        >
          <div
            v-for="u in filesFor(req.id)"
            :key="u.id"
            class="tw:flex tw:items-center tw:gap-2 tw:py-1.5"
          >
            <IconFile :size="15" class="tw:text-blue-600 tw:shrink-0" />
            <span class="tw:flex-1 tw:min-w-0 tw:text-sm tw:truncate">{{ fileName(u) }}</span>
            <button
              type="button"
              class="tw:text-secondary tw:hover:text-primary tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0"
              title="Open"
              @click="openAsset(u)"
            >
              <IconExternalLink :size="14" />
            </button>
            <button
              v-if="canManageRequests"
              type="button"
              class="tw:text-red-600 tw:hover:bg-red-50 tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0"
              title="Remove"
              @click="removeUpload(u)"
            >
              <IconTrash :size="14" />
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="!requests.length"
        class="tw:py-4 tw:text-center tw:text-sm tw:text-secondary tw:italic"
      >
        No documents requested yet.
      </div>
    </div>

    <!-- Add a request (auditor) -->
    <div v-if="canManageRequests" class="tw:flex tw:items-center tw:gap-2">
      <BaseTextInput
        v-model="newTitle"
        size="sm"
        placeholder="Request a document (e.g. Quality Manual, Calibration records 2025)…"
        class="tw:flex-1"
        @keyup.enter="addRequest"
      />
      <BaseButton
        variant="outline"
        size="sm"
        :loading="adding"
        :disabled="!newTitle.trim()"
        @click="addRequest"
      >
        <template #icon><IconPlus :size="14" /></template>
        Add
      </BaseButton>
    </div>

    <!-- Additional documents (not tied to a specific request) -->
    <div class="tw:border-t tw:border-divider tw:pt-3">
      <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
        <BaseText variant="overline">Additional documents</BaseText>
        <BaseButton v-if="!readonly" variant="outline" size="sm" @click="openUpload(null)">
          <template #icon><IconUpload :size="14" /></template>
          Upload
        </BaseButton>
      </div>
      <div v-if="addOns.length" class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <div v-for="u in addOns" :key="u.id" class="tw:flex tw:items-center tw:gap-2 tw:py-1.5">
          <IconFile :size="15" class="tw:text-blue-600 tw:shrink-0" />
          <span class="tw:flex-1 tw:min-w-0 tw:text-sm tw:truncate">{{ fileName(u) }}</span>
          <button
            type="button"
            class="tw:text-secondary tw:hover:text-primary tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0"
            title="Open"
            @click="openAsset(u)"
          >
            <IconExternalLink :size="14" />
          </button>
          <button
            v-if="canManageRequests"
            type="button"
            class="tw:text-red-600 tw:hover:bg-red-50 tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0"
            title="Remove"
            @click="removeUpload(u)"
          >
            <IconTrash :size="14" />
          </button>
        </div>
      </div>
      <p v-else class="tw:text-xs tw:text-secondary tw:italic">No additional documents.</p>
    </div>

    <AuditEvidenceUploadDialog
      v-model="showUpload"
      :auditInstanceId="auditInstance.id"
      :scope="uploadScope"
      :scopeId="uploadScopeId"
    />
  </div>
</template>
