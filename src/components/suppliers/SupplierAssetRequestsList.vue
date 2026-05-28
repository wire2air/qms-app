<script setup>
/**
 * Supplier-side asset requests list — drops on /<companyCode>/supplier.
 *
 * Per the C.5 RLS extensions, a supplier user sees asset_requests +
 * asset_request_items + supplier_documents scoped to their own
 * supplier_id.  No filter needed in the live query — RLS does the
 * scoping at the DB layer.
 *
 * Each open request is rendered as an expandable card with its line
 * items.  PENDING items get an upload button; RECEIVED items show the
 * upload metadata; SKIPPED items are greyed out.
 */
import {
  IconUpload,
  IconCircleCheck,
  IconCircleMinus,
  IconChevronDown,
  IconChevronRight,
  IconFileText,
} from '@tabler/icons-vue'
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const toast = useToast()

// RLS makes this user-scoped already; the SyncEngine sync respects it.
const myRequests = useLiveQuery(
  async (db) => {
    const rows = await db.AssetRequest.where().exec()
    return rows.sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    )
  },
  { initial: [] },
)

const allItems = useLiveQuery(
  async (db) => db.AssetRequestItem.where().exec(),
  { initial: [] },
)

const allTypes = useLiveQuery(
  async (db) => db.AssetRequestType.where().exec(),
  { initial: [] },
)

const typeById = computed(() => {
  const m = new Map()
  for (const t of allTypes.value) m.set(t.id, t)
  return m
})

function itemsFor(requestId) {
  return allItems.value
    .filter((i) => i.assetRequestId === requestId)
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
}

function itemLabel(item) {
  if (item.assetRequestTypeId) return typeById.value.get(item.assetRequestTypeId)?.name || item.assetRequestTypeId
  return item.customTitle || 'Untitled request'
}

function itemSubtitle(item) {
  if (item.assetRequestTypeId) return typeById.value.get(item.assetRequestTypeId)?.description || ''
  return item.customDescription || ''
}

const expanded = ref(new Set())
function toggleExpand(id) {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expanded.value = s
}

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
      await post(`/v1/services/assetRequestItems/${item.id}/upload`, fd)
      toast.success('Uploaded')
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

function progressForRequest(req) {
  const items = itemsFor(req.id)
  if (items.length === 0) return { received: 0, total: 0 }
  return {
    received: items.filter((i) => i.statusId === 'RECEIVED' || i.statusId === 'SKIPPED').length,
    total: items.length,
  }
}
</script>

<template>
  <section class="tw:bg-white tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:space-y-3">
    <div class="tw:flex tw:items-center tw:gap-2">
      <IconUpload :size="18" class="tw:text-primary" />
      <h2 class="tw:text-base tw:font-semibold tw:text-on-main">
        Asset Requests
        <span v-if="myRequests.length" class="tw:text-secondary tw:font-normal tw:text-sm">
          ({{ myRequests.length }})
        </span>
      </h2>
    </div>

    <p v-if="myRequests.length === 0" class="tw:text-xs tw:text-secondary tw:italic tw:py-2">
      No document requests from the client right now.
    </p>

    <ul v-else class="tw:flex tw:flex-col tw:gap-2">
      <li
        v-for="req in myRequests"
        :key="req.id"
        class="tw:rounded tw:border tw:border-divider tw:bg-card"
      >
        <button
          type="button"
          class="tw:w-full tw:flex tw:items-center tw:gap-3 tw:p-3 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:text-left"
          @click="toggleExpand(req.id)"
        >
          <component
            :is="expanded.has(req.id) ? IconChevronDown : IconChevronRight"
            :size="14"
            class="tw:text-secondary"
          />
          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:text-sm tw:font-semibold tw:text-on-main">{{ req.title }}</div>
            <div class="tw:text-xs tw:text-secondary">
              {{ progressForRequest(req).received }} of {{ progressForRequest(req).total }} received
              <span v-if="req.dueDate" class="tw:ml-2">· due {{ req.dueDate }}</span>
            </div>
          </div>
          <span
            class="tw:text-[10px] tw:rounded tw:px-1.5 tw:py-0.5"
            :class="
              req.statusId === 'RECEIVED'
                ? 'tw:bg-green-100 tw:text-green-700'
                : 'tw:bg-amber-100 tw:text-amber-700'
            "
          >
            {{ req.statusId }}
          </span>
        </button>

        <div v-if="expanded.has(req.id)" class="tw:px-3 tw:pb-3 tw:flex tw:flex-col tw:gap-2">
          <p v-if="req.description" class="tw:text-xs tw:text-secondary tw:italic">
            {{ req.description }}
          </p>
          <ul class="tw:flex tw:flex-col tw:divide-y tw:divide-divider tw:rounded tw:border tw:border-divider">
            <li
              v-for="item in itemsFor(req.id)"
              :key="item.id"
              class="tw:flex tw:items-start tw:gap-2 tw:p-2 tw:text-sm"
              :class="item.statusId === 'SKIPPED' ? 'tw:opacity-50' : ''"
            >
              <div class="tw:mt-0.5">
                <IconCircleCheck
                  v-if="item.statusId === 'RECEIVED'"
                  :size="14"
                  class="tw:text-green-600"
                />
                <IconCircleMinus
                  v-else-if="item.statusId === 'SKIPPED'"
                  :size="14"
                  class="tw:text-secondary"
                />
                <IconFileText v-else :size="14" class="tw:text-primary" />
              </div>
              <div class="tw:flex-1 tw:min-w-0">
                <div class="tw:font-medium tw:text-on-main">{{ itemLabel(item) }}</div>
                <div v-if="itemSubtitle(item)" class="tw:text-xs tw:text-secondary">
                  {{ itemSubtitle(item) }}
                </div>
                <div v-if="item.notes" class="tw:text-xs tw:text-secondary tw:italic tw:mt-0.5">
                  {{ item.notes }}
                </div>
              </div>
              <BaseButton
                v-if="item.statusId === 'PENDING'"
                variant="primary"
                size="sm"
                :loading="uploading.has(item.id)"
                @click="pickAndUpload(item)"
              >
                <IconUpload :size="14" />
                Upload
              </BaseButton>
              <span
                v-else-if="item.statusId === 'RECEIVED'"
                class="tw:text-[10px] tw:bg-green-100 tw:text-green-700 tw:rounded tw:px-1.5 tw:py-0.5"
              >
                Received
              </span>
            </li>
          </ul>
        </div>
      </li>
    </ul>
  </section>
</template>
