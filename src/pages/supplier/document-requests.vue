<script setup>
/**
 * /<companyCode>/supplier/document-requests — flat queue of every
 * AssetRequestItem that's been requested from this supplier, broken into
 * Pending and Completed sections. Per-item upload (and Replace, for
 * already-received items) right from the row.
 *
 * Same RLS as SupplierAssetRequestsList: the rows are already scoped to
 * the supplier's user by the C.5 RLS extension. No filter needed here.
 */
import {
  IconUpload,
  IconRefresh,
  IconCircleCheck,
  IconCircleMinus,
  IconFileText,
  IconClipboardList,
  IconCircleDot,
} from '@tabler/icons-vue'
import { upload } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { currentSession } from '@/utils/currentSession.js'

defineOptions({ name: 'SupplierDocumentRequestsPage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }

const toast = useToast()

const requests = useLiveQuery(
  async (db) => db.AssetRequest.where().exec(),

  { models: ['AssetRequest'], initial: [] },
)
const items = useLiveQuery(
  async (db) => db.AssetRequestItem.where().exec(),

  { models: ['AssetRequestItem'], initial: [] },
)
const types = useLiveQuery(
  async (db) => db.AssetRequestType.where().exec(),

  { models: ['AssetRequestType'], initial: [] },
)

const requestById = computed(() => {
  const m = new Map()
  for (const r of requests.value) m.set(r.id, r)
  return m
})
const typeById = computed(() => {
  const m = new Map()
  for (const t of types.value) m.set(t.id, t)
  return m
})

function itemLabel(item) {
  if (item.assetRequestTypeId) {
    return typeById.value.get(item.assetRequestTypeId)?.name || item.assetRequestTypeId
  }
  return item.customTitle || 'Untitled request'
}
function itemSubtitle(item) {
  if (item.assetRequestTypeId) {
    return typeById.value.get(item.assetRequestTypeId)?.description || ''
  }
  return item.customDescription || ''
}
function parentTitle(item) {
  return requestById.value.get(item.assetRequestId)?.title || '—'
}
function parentDueDate(item) {
  return requestById.value.get(item.assetRequestId)?.dueDate || null
}

// Sort: oldest pending first (most urgent), newest received first.
const pendingItems = computed(() =>
  items.value
    .filter((i) => i.statusId === 'PENDING')
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)),
)
const completedItems = computed(() =>
  items.value
    .filter((i) => i.statusId === 'RECEIVED')
    .sort((a, b) => (b.uploadedAt?.toMillis?.() ?? 0) - (a.uploadedAt?.toMillis?.() ?? 0)),
)
const skippedItems = computed(() => items.value.filter((i) => i.statusId === 'SKIPPED'))

const uploading = ref(new Set())

async function pickAndUpload(item) {
  if (uploading.value.has(item.id)) return
  const input = document.createElement('input')
  input.type = 'file'
  input.onchange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    uploading.value = new Set([...uploading.value, item.id])
    try {
      const fd = new FormData()
      fd.append('file', file)
      await upload(`/v1/services/assetRequestItems/${item.id}/upload`, fd)
      toast.success(item.statusId === 'RECEIVED' ? 'File replaced' : 'Uploaded')
    } catch (err) {
      toast.error(err?.message || 'Upload failed')
    } finally {
      const s = new Set(uploading.value)
      s.delete(item.id)
      uploading.value = s
    }
  }
  input.click()
}
</script>

<template>
  <div class="tw:p-5 tw:max-w-5xl tw:mx-auto tw:flex tw:flex-col tw:gap-5">
    <div class="tw:flex tw:items-center tw:gap-3">
      <IconClipboardList :size="28" class="tw:text-primary tw:shrink-0" />
      <div class="tw:flex-1">
        <h1 class="tw:text-2xl tw:font-bold tw:text-on-main">Document Requests</h1>
        <p class="tw:text-sm tw:text-secondary">
          Every document the client has asked you for. Upload each one — you can replace an
          already-sent file at any time until the request is closed.
        </p>
      </div>
      <!-- Diagnostic counters — handy until the sync pipeline is stable.
           Strip these once we're confident new requests reliably surface. -->
      <div class="tw:text-right tw:text-xs tw:text-secondary tw:font-mono">
        <div>{{ requests.length }} request{{ requests.length === 1 ? '' : 's' }}</div>
        <div>{{ items.length }} item{{ items.length === 1 ? '' : 's' }} in IDB</div>
        <div v-if="currentSession?.supplierId" class="tw:text-micro">
          supplier: {{ currentSession.supplierId.slice(0, 8) }}…
        </div>
      </div>
    </div>

    <!-- Pending -->
    <section class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3">
      <div class="tw:flex tw:items-center tw:gap-2">
        <IconCircleDot :size="18" class="tw:text-amber-600" />
        <h2 class="tw:text-base tw:font-semibold tw:text-on-main">
          Pending
          <span v-if="pendingItems.length" class="tw:text-secondary tw:font-normal tw:text-sm">
            ({{ pendingItems.length }})
          </span>
        </h2>
      </div>
      <p v-if="pendingItems.length === 0" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
        Nothing pending — you're all caught up.
      </p>
      <ul v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <li
          v-for="item in pendingItems"
          :key="item.id"
          class="tw:flex tw:items-start tw:gap-3 tw:py-3 tw:text-sm"
        >
          <IconFileText :size="16" class="tw:text-primary tw:shrink-0 tw:mt-0.5" />
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:font-medium tw:text-on-main">{{ itemLabel(item) }}</div>
            <div v-if="itemSubtitle(item)" class="tw:text-xs tw:text-secondary">
              {{ itemSubtitle(item) }}
            </div>
            <div class="tw:text-caption tw:text-secondary tw:mt-0.5">
              From request: <span class="tw:font-medium">{{ parentTitle(item) }}</span>
              <span v-if="parentDueDate(item)"> · due {{ parentDueDate(item) }}</span>
            </div>
            <div v-if="item.notes" class="tw:text-xs tw:text-secondary tw:italic tw:mt-0.5">
              {{ item.notes }}
            </div>
          </div>
          <BaseButton
            variant="primary"
            size="sm"
            :loading="uploading.has(item.id)"
            @click="pickAndUpload(item)"
          >
            <IconUpload :size="14" />
            Upload
          </BaseButton>
        </li>
      </ul>
    </section>

    <!-- Completed -->
    <section class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3">
      <div class="tw:flex tw:items-center tw:gap-2">
        <IconCircleCheck :size="18" class="tw:text-green-600" />
        <h2 class="tw:text-base tw:font-semibold tw:text-on-main">
          Already shared
          <span v-if="completedItems.length" class="tw:text-secondary tw:font-normal tw:text-sm">
            ({{ completedItems.length }})
          </span>
        </h2>
      </div>
      <p v-if="completedItems.length === 0" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
        You haven't uploaded anything yet.
      </p>
      <ul v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <li
          v-for="item in completedItems"
          :key="item.id"
          class="tw:flex tw:items-start tw:gap-3 tw:py-3 tw:text-sm"
        >
          <IconCircleCheck :size="16" class="tw:text-green-600 tw:shrink-0 tw:mt-0.5" />
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:font-medium tw:text-on-main">{{ itemLabel(item) }}</div>
            <div class="tw:text-caption tw:text-secondary tw:mt-0.5">
              From request: <span class="tw:font-medium">{{ parentTitle(item) }}</span>
              <span v-if="item.uploadedAt"> · uploaded {{ item.uploadedAt.toRelative?.() }}</span>
            </div>
          </div>
          <BaseButton
            variant="secondary"
            size="sm"
            :loading="uploading.has(item.id)"
            @click="pickAndUpload(item)"
          >
            <IconRefresh :size="14" />
            Replace
          </BaseButton>
        </li>
      </ul>
    </section>

    <!-- Skipped (collapsed when empty) -->
    <section
      v-if="skippedItems.length"
      class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3"
    >
      <div class="tw:flex tw:items-center tw:gap-2">
        <IconCircleMinus :size="18" class="tw:text-secondary" />
        <h2 class="tw:text-base tw:font-semibold tw:text-on-main">
          Not applicable
          <span class="tw:text-secondary tw:font-normal tw:text-sm">
            ({{ skippedItems.length }})
          </span>
        </h2>
      </div>
      <ul class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <li
          v-for="item in skippedItems"
          :key="item.id"
          class="tw:flex tw:items-start tw:gap-3 tw:py-3 tw:text-sm tw:opacity-60"
        >
          <IconCircleMinus :size="16" class="tw:text-secondary tw:shrink-0 tw:mt-0.5" />
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:font-medium tw:text-on-main">{{ itemLabel(item) }}</div>
            <div class="tw:text-caption tw:text-secondary tw:mt-0.5">
              The client marked this one as not applicable.
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
