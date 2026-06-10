<script setup>
/**
 * Evidence panel — lists every audit_evidence + audit_evidence_links
 * row scoped to the audit (and optionally further-scoped to a finding
 * or requirement response). Two CTAs on top:
 *   - Upload File   → opens AuditEvidenceUploadDialog
 *   - Link Existing → opens AuditEvidenceLinkDialog
 *
 * Each row carries an inline caption (click-to-edit when editable),
 * an "Open" button (Asset URL for uploads; deep link for polymorphic
 * record links), and a delete affordance.
 */
import { IconFile, IconLink, IconPaperclip, IconTrash, IconExternalLink } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { patch, del } from '@/api'

const props = defineProps({
  auditInstance: { type: Object, required: true },
  // Optional scope. 'audit' shows audit-overall rows; 'finding' /
  // 'response' filter to that specific scope.
  scope: { type: String, default: 'audit' },
  scopeId: { type: String, default: null },
  readonly: { type: Boolean, default: false },
})

const toast = useToast()
const router = useRouter()

// ── Uploads (audit_evidence) ───────────────────────────────────────

const uploads = useLiveQueryWithDeps(
  [() => props.auditInstance.id, () => props.scope, () => props.scopeId],
  async (db, [instanceId, scope, scopeId]) => {
    if (!instanceId) return []
    const rows = await db.AuditEvidence.where('auditInstanceId', instanceId).exec()
    return rows.filter((r) => {
      if (scope === 'finding') return r.auditFindingId === scopeId
      if (scope === 'response') return r.auditRequirementResponseId === scopeId
      // 'audit' scope = rows NOT bound to a finding or response.
      return !r.auditFindingId && !r.auditRequirementResponseId
    })
  },
  { initial: [] },
)

// Asset rows for the uploads list, keyed by id → URL / filename so
// the render can resolve them in one pass.
const assetIdList = computed(() =>
  uploads.value.map((u) => u.assetId).filter(Boolean).join(','),
)
const assetsById = useLiveQueryWithDeps(
  [() => assetIdList.value],
  async (db, [csv]) => {
    if (!csv) return {}
    const ids = csv.split(',').filter(Boolean)
    const rows = await db.Asset.where().exec()
    const wanted = new Set(ids)
    const map = {}
    for (const a of rows) if (wanted.has(a.id)) map[a.id] = a
    return map
  },
  { initial: {} },
)

// ── Links (audit_evidence_links) ───────────────────────────────────

const links = useLiveQueryWithDeps(
  [() => props.auditInstance.id, () => props.scope, () => props.scopeId],
  async (db, [instanceId, scope, scopeId]) => {
    if (!instanceId) return []
    const rows = await db.AuditEvidenceLink.where('auditInstanceId', instanceId).exec()
    return rows.filter((r) => {
      if (scope === 'finding') return r.auditFindingId === scopeId
      if (scope === 'response') return r.auditRequirementResponseId === scopeId
      return !r.auditFindingId && !r.auditRequirementResponseId
    })
  },
  { initial: [] },
)

// Audio attachments are voice notes (#2) — surfaced in AuditVoiceNotesPanel,
// not here, so they don't show in two places.
const visibleUploads = computed(() =>
  uploads.value.filter((u) => !(assetsById.value[u.assetId]?.mimeType || '').startsWith('audio/')),
)

const totalCount = computed(() => visibleUploads.value.length + links.value.length)

// ── Open / delete ─────────────────────────────────────────────────

function openAsset(upload) {
  const asset = assetsById.value[upload.assetId]
  if (asset?.url) window.open(asset.url, '_blank')
}

// Map entity_type → FE route. Mirrors workflow back-link conventions.
const LINK_ROUTE_MAP = {
  Document: (id) => `/documents/${id}`,
  DocumentVersion: (id) => `/documents/${id}`, // doc detail page resolves the version
  FieldRecord: (id) => `/inspections-logs/records/${id}`,
  Capa: (id) => `/capas/${id}`,
  Nonconformance: (id) => `/nonconformances/${id}`,
  ChangeRequest: (id) => `/change-requests/${id}`,
  TrainingInstance: (id) => `/training-instances/${id}`,
  LogBookVersion: (id) => `/inspections-logs/log-books/${id}`,
  SupplierAsset: () => `/suppliers`,
}

function openLink(link) {
  const builder = LINK_ROUTE_MAP[link.entityType]
  if (!builder) {
    toast.warning('Unknown link target — no deep route configured')
    return
  }
  router.push(getCompanyPath(builder(link.entityId)))
}

async function removeUpload(upload) {
  if (props.readonly) return
  if (!confirm('Remove this evidence file from the audit?')) return
  try {
    await del(`/v1/services/auditEvidence/${upload.id}`)
    toast.success('Evidence removed')
  } catch (e) {
    toast.error(e.message || 'Failed to remove evidence')
  }
}

async function removeLink(link) {
  if (props.readonly) return
  if (!confirm('Unlink this record from the audit?')) return
  try {
    await del(`/v1/services/auditEvidenceLinks/${link.id}`)
    toast.success('Evidence unlinked')
  } catch (e) {
    toast.error(e.message || 'Failed to unlink evidence')
  }
}

// ── Caption inline-edit ───────────────────────────────────────────
//
// Local buffers keyed by row id so a typing burst doesn't fight the
// live-query refresh. Save on blur.
const editingCaption = ref(null)
const captionBuffer = ref('')

function startCaptionEdit(row) {
  if (props.readonly) return
  editingCaption.value = row.id
  captionBuffer.value = row.caption ?? ''
}

async function saveCaption(row, kind) {
  if (editingCaption.value !== row.id) return
  const next = captionBuffer.value.trim()
  if ((row.caption ?? '') === next) {
    editingCaption.value = null
    return
  }
  try {
    const path = kind === 'upload' ? 'auditEvidence' : 'auditEvidenceLinks'
    await patch(`/v1/services/${path}/${row.id}`, { caption: next || null })
  } catch (e) {
    toast.error(e.message || 'Failed to save caption')
  } finally {
    editingCaption.value = null
  }
}

// ── Dialog state ──────────────────────────────────────────────────
const showUploadDialog = ref(false)
const showLinkDialog = ref(false)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <div
      class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider"
    >
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
        <IconPaperclip :size="14" class="tw:text-secondary" />
        <span class="tw:font-medium">
          {{ totalCount }} evidence item{{ totalCount === 1 ? '' : 's' }}
        </span>
      </div>
      <div v-if="!readonly" class="tw:flex tw:items-center tw:gap-2">
        <BaseButton variant="outline" size="sm" @click="showLinkDialog = true">
          <template #icon><IconLink :size="14" /></template>
          Link Record
        </BaseButton>
        <BaseButton variant="outline" size="sm" @click="showUploadDialog = true">
          <template #icon><IconFile :size="14" /></template>
          Upload File
        </BaseButton>
      </div>
    </div>

    <div
      v-if="!totalCount"
      class="tw:py-6 tw:text-center tw:text-sm tw:text-secondary tw:italic"
    >
      No evidence attached.
    </div>

    <div v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
      <!-- File uploads (audio voice notes excluded — see AuditVoiceNotesPanel) -->
      <div
        v-for="u in visibleUploads"
        :key="`up-${u.id}`"
        class="tw:flex tw:items-start tw:gap-3 tw:py-2"
      >
        <IconFile :size="16" class="tw:text-blue-600 tw:mt-0.5 tw:shrink-0" />
        <div class="tw:flex-1 tw:min-w-0">
          <p class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">
            {{ assetsById[u.assetId]?.originalFilename || assetsById[u.assetId]?.filename || 'Uploaded file' }}
          </p>
          <div v-if="editingCaption === u.id" class="tw:mt-1">
            <BaseTextInput
              v-model="captionBuffer"
              size="sm"
              autofocus
              placeholder="Caption…"
              @blur="saveCaption(u, 'upload')"
              @keyup.enter="saveCaption(u, 'upload')"
            />
          </div>
          <p
            v-else-if="u.caption || !readonly"
            class="tw:text-xs tw:text-secondary tw:mt-0.5"
            :class="!readonly ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
            @click="startCaptionEdit(u)"
          >
            {{ u.caption || 'Add caption…' }}
          </p>
        </div>
        <button
          type="button"
          class="tw:text-secondary tw:hover:text-primary tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0"
          title="Open"
          @click="openAsset(u)"
        >
          <IconExternalLink :size="14" />
        </button>
        <button
          v-if="!readonly"
          type="button"
          class="tw:text-red-600 tw:hover:bg-red-50 tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0"
          title="Remove"
          @click="removeUpload(u)"
        >
          <IconTrash :size="14" />
        </button>
      </div>

      <!-- Polymorphic record links -->
      <div
        v-for="l in links"
        :key="`lk-${l.id}`"
        class="tw:flex tw:items-start tw:gap-3 tw:py-2"
      >
        <IconLink :size="16" class="tw:text-emerald-600 tw:mt-0.5 tw:shrink-0" />
        <div class="tw:flex-1 tw:min-w-0">
          <p class="tw:text-sm tw:font-medium tw:text-on-main tw:truncate">
            {{ l.entityType }}
            <code class="tw:text-xs tw:text-secondary tw:font-mono tw:ml-1">
              {{ l.entityId?.slice(0, 8) }}
            </code>
          </p>
          <div v-if="editingCaption === l.id" class="tw:mt-1">
            <BaseTextInput
              v-model="captionBuffer"
              size="sm"
              autofocus
              placeholder="Caption…"
              @blur="saveCaption(l, 'link')"
              @keyup.enter="saveCaption(l, 'link')"
            />
          </div>
          <p
            v-else-if="l.caption || !readonly"
            class="tw:text-xs tw:text-secondary tw:mt-0.5"
            :class="!readonly ? 'tw:cursor-pointer tw:hover:text-primary' : ''"
            @click="startCaptionEdit(l)"
          >
            {{ l.caption || 'Add caption…' }}
          </p>
        </div>
        <button
          type="button"
          class="tw:text-secondary tw:hover:text-primary tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0"
          title="Open"
          @click="openLink(l)"
        >
          <IconExternalLink :size="14" />
        </button>
        <button
          v-if="!readonly"
          type="button"
          class="tw:text-red-600 tw:hover:bg-red-50 tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0"
          title="Unlink"
          @click="removeLink(l)"
        >
          <IconTrash :size="14" />
        </button>
      </div>
    </div>

    <AuditEvidenceUploadDialog
      v-model="showUploadDialog"
      :auditInstanceId="auditInstance.id"
      :scope="scope"
      :scopeId="scopeId"
    />
    <AuditEvidenceLinkDialog
      v-model="showLinkDialog"
      :auditInstanceId="auditInstance.id"
      :scope="scope"
      :scopeId="scopeId"
    />
  </div>
</template>
