<script setup>
import { DateTime } from 'luxon'
import {
  IconClipboardList,
  IconClipboard,
  IconUpload,
  IconStar,
  IconPencil,
  IconTrash,
  IconPlus,
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconCircleMinus,
  IconCircleDot,
  IconAlertTriangle,
  IconFileText,
} from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  supplierId: {
    type: String,
    required: true,
  },
})

const canUpdate = computed(() => isAllowed(['suppliers:update']))
const { confirm } = useConfirm()

// ─── Live queries ─────────────────────────────────────────────────────────────

const assetRequests = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) => {
    const rows = await db.AssetRequest.where('supplierId', supplierId).exec()
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },

  { models: ['AssetRequest'], initial: [] },
)

const allItems = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db) => db.AssetRequestItem.where().exec(),

  { models: ['AssetRequestItem'], initial: [] },
)

const allTypes = useLiveQuery(
  async (db) => db.AssetRequestType.where().exec(),

  { models: ['AssetRequestType'], initial: [] },
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
  if (item.assetRequestTypeId) {
    return typeById.value.get(item.assetRequestTypeId)?.name || item.assetRequestTypeId
  }
  return item.customTitle || 'Untitled request'
}

function progressFor(request) {
  const items = itemsFor(request.id)
  if (!items.length) return { total: 0, received: 0, pending: 0 }
  const received = items.filter((i) => i.statusId === 'RECEIVED' || i.statusId === 'SKIPPED').length
  return { total: items.length, received, pending: items.length - received }
}

function isOverdue(request) {
  if (!request.dueDate) return false
  if (['RECEIVED', 'ACCEPTED'].includes(request.statusId)) return false
  const due = DateTime.isDateTime(request.dueDate)
    ? request.dueDate
    : DateTime.fromISO(String(request.dueDate))
  if (!due.isValid) return false
  return due.endOf('day') < DateTime.now()
}

// Tab-level summary: how many requests outstanding (parent still PENDING
// or any item still pending) vs done. Drives the header pill.
const summary = computed(() => {
  const total = assetRequests.value.length
  let pending = 0
  let overdue = 0
  for (const r of assetRequests.value) {
    const isPendingParent = !['RECEIVED', 'ACCEPTED', 'REJECTED'].includes(r.statusId)
    if (isPendingParent) pending += 1
    if (isOverdue(r)) overdue += 1
  }
  return { total, pending, overdue }
})

// Expand / collapse per row.
const expanded = ref(new Set())
function toggleExpand(id) {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expanded.value = s
}

async function removeItem(item) {
  if (
    !(await confirm({
      title: 'Remove item',
      message: `Remove "${itemLabel(item)}" from this request?`,
      okLabel: 'Remove',
      danger: true,
    }))
  ) {
    return
  }
  try {
    await item.delete()
  } catch (err) {
    alert(err?.message || 'Failed to remove item')
  }
}

const contacts = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [supplierId]) => db.SupplierContact.where('supplierId', supplierId).exec(),

  { models: ['SupplierContact'], initial: [] },
)

// ─── Dialogs ──────────────────────────────────────────────────────────────────

const showDialog = ref(false)
const editingRequest = ref(null)

const showSubmitDialog = ref(false)
const submittingRequest = ref(null)

const showReviewDialog = ref(false)
const reviewingRequestId = ref(null)

function openCreateDialog() {
  editingRequest.value = null
  showDialog.value = true
}

function openEditDialog(request) {
  editingRequest.value = request
  showDialog.value = true
}

function openSubmitDialog(request) {
  submittingRequest.value = request
  showSubmitDialog.value = true
}

function openReviewDialog(request) {
  reviewingRequestId.value = request.id
  showReviewDialog.value = true
}

// ─── Delete ───────────────────────────────────────────────────────────────────

const confirmDialog = ref(null)

function onDeleteRequest(request) {
  confirmDialog.value = {
    title: 'Delete Asset Request',
    message: `Are you sure you want to delete "${request.title}"?`,
    okLabel: 'Delete',
    onOk: async () => {
      await request.delete()
      confirmDialog.value = null
    },
  }
}

function formatDate(value) {
  if (!value) return '—'
  return value?.formatDate?.('date') || value
}
</script>

<template>
  <div
    class="tw:bg-sidebar tw:rounded-xl tw:shadow-sm tw:border tw:border-divider tw:overflow-hidden"
  >
    <!-- Header -->
    <div
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between"
    >
      <div class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
        <div
          class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-gray-100 tw:flex tw:items-center tw:justify-center"
        >
          <IconClipboardList :size="20" class="tw:text-secondary" />
        </div>
        <h3 class="tw:text-lg tw:font-bold tw:text-on-main">Asset Requests</h3>
        <span
          v-if="summary.total"
          class="tw:inline-flex tw:items-center tw:justify-center tw:rounded-full tw:bg-gray-200 tw:text-gray-700 tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-bold"
        >
          {{ summary.total }}
        </span>
        <span
          v-if="summary.pending"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded tw:bg-amber-100 tw:text-amber-700 tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-bold"
        >
          <IconCircleDot :size="10" />
          {{ summary.pending }} pending
        </span>
        <span
          v-if="summary.overdue"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded tw:bg-red-100 tw:text-red-700 tw:px-2 tw:py-0.5 tw:text-[10px] tw:font-bold"
        >
          <IconAlertTriangle :size="10" />
          {{ summary.overdue }} overdue
        </span>
      </div>
      <BaseButton v-if="canUpdate" variant="outline" @click="openCreateDialog">
        <IconPlus :size="16" />
        <span>New Request</span>
      </BaseButton>
    </div>

    <!-- List -->
    <div v-if="assetRequests.length" class="tw:divide-y tw:divide-divider">
      <div v-for="request in assetRequests" :key="request.id">
        <!-- Row header -->
        <BaseClickableRow
          class="tw:p-4 tw:flex tw:items-start tw:gap-3 tw:hover:bg-main-hover tw:transition-colors"
          :aria-label="`Toggle details for asset request ${request.title}`"
          @click="toggleExpand(request.id)"
        >
          <component
            :is="expanded.has(request.id) ? IconChevronDown : IconChevronRight"
            :size="16"
            class="tw:text-secondary tw:mt-1 tw:shrink-0"
          />
          <div
            class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-primary/10 tw:flex tw:items-center tw:justify-center tw:shrink-0 tw:mt-0.5"
          >
            <IconClipboard :size="20" class="tw:text-primary" />
          </div>

          <div class="tw:flex-1 tw:min-w-0">
            <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
              <p class="tw:text-sm tw:font-medium tw:text-on-main">{{ request.title }}</p>
              <AssetRequestStatusBadgeById v-if="request.statusId" :statusId="request.statusId" />
              <span
                v-if="isOverdue(request)"
                class="tw:inline-flex tw:items-center tw:gap-1 tw:text-[10px] tw:rounded tw:bg-red-100 tw:text-red-700 tw:px-1.5 tw:py-0.5"
              >
                <IconAlertTriangle :size="10" />
                Overdue
              </span>
              <span
                v-if="progressFor(request).total"
                class="tw:text-[10px] tw:rounded tw:px-1.5 tw:py-0.5 tw:bg-gray-100 tw:text-secondary"
              >
                {{ progressFor(request).received }} / {{ progressFor(request).total }} received
              </span>
            </div>
            <div class="tw:flex tw:items-center tw:gap-3 tw:mt-1 tw:flex-wrap">
              <AssetRequestTypeBadgeById
                v-if="request.requestTypeId"
                :typeId="request.requestTypeId"
              />
              <span
                v-if="request.dueDate"
                class="tw:text-xs"
                :class="isOverdue(request) ? 'tw:text-red-600 tw:font-medium' : 'tw:text-secondary'"
              >
                Due: {{ formatDate(request.dueDate) }}
              </span>
              <span v-if="request.expiryDate" class="tw:text-xs tw:text-secondary">
                Expires: {{ formatDate(request.expiryDate) }}
              </span>
            </div>
            <p v-if="request.description" class="tw:text-xs tw:text-secondary tw:mt-1 tw:truncate">
              {{ request.description }}
            </p>
          </div>

          <div v-if="canUpdate" class="tw:flex tw:items-center tw:gap-1 tw:shrink-0" @click.stop>
            <button
              v-if="['PENDING', 'OVERDUE'].includes(request.statusId)"
              class="tw:p-1.5 tw:rounded tw:text-green-500 tw:hover:text-green-700 tw:hover:bg-green-50 tw:transition-colors"
              title="Submit request"
              @click="openSubmitDialog(request)"
            >
              <IconUpload :size="16" />
            </button>
            <button
              v-if="request.statusId === 'RECEIVED'"
              class="tw:p-1.5 tw:rounded tw:text-primary tw:hover:bg-primary/10 tw:transition-colors"
              title="Review document"
              @click="openReviewDialog(request)"
            >
              <IconStar :size="16" />
            </button>
            <button
              v-if="['PENDING', 'OVERDUE', 'RECEIVED'].includes(request.statusId)"
              class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-on-main tw:hover:bg-main-hover tw:transition-colors"
              title="Edit request"
              @click="openEditDialog(request)"
            >
              <IconPencil :size="16" />
            </button>
            <button
              class="tw:p-1.5 tw:rounded tw:text-red-400 tw:hover:text-red-600 tw:hover:bg-red-50 tw:transition-colors"
              title="Delete request"
              @click="onDeleteRequest(request)"
            >
              <IconTrash :size="16" />
            </button>
          </div>
        </BaseClickableRow>

        <!-- Items detail -->
        <div
          v-if="expanded.has(request.id)"
          class="tw:bg-main-hover tw:px-6 tw:py-3 tw:border-t tw:border-divider"
        >
          <div
            v-if="itemsFor(request.id).length === 0"
            class="tw:text-xs tw:text-secondary tw:italic"
          >
            No item lines on this request (legacy single-file request).
          </div>
          <ul v-else class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
            <li
              v-for="item in itemsFor(request.id)"
              :key="item.id"
              class="tw:flex tw:items-start tw:gap-3 tw:py-2 tw:text-sm"
              :class="item.statusId === 'SKIPPED' ? 'tw:opacity-60' : ''"
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
                <div v-if="item.customDescription" class="tw:text-xs tw:text-secondary">
                  {{ item.customDescription }}
                </div>
                <div v-if="item.uploadedAt" class="tw:text-[11px] tw:text-secondary tw:mt-0.5">
                  Uploaded {{ item.uploadedAt.toRelative?.() }}
                </div>
              </div>
              <span
                v-if="item.statusId === 'RECEIVED'"
                class="tw:text-[10px] tw:rounded tw:bg-green-100 tw:text-green-700 tw:px-1.5 tw:py-0.5"
              >
                Received
              </span>
              <span
                v-else-if="item.statusId === 'SKIPPED'"
                class="tw:text-[10px] tw:rounded tw:bg-gray-100 tw:text-secondary tw:px-1.5 tw:py-0.5"
              >
                Skipped
              </span>
              <span
                v-else
                class="tw:text-[10px] tw:rounded tw:bg-amber-100 tw:text-amber-700 tw:px-1.5 tw:py-0.5"
              >
                Pending
              </span>
              <button
                v-if="canUpdate && item.statusId !== 'RECEIVED'"
                class="tw:p-1 tw:rounded tw:text-red-400 tw:hover:text-red-600 tw:hover:bg-red-50 tw:transition-colors"
                title="Remove item from this request"
                @click="removeItem(item)"
              >
                <IconTrash :size="14" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Empty -->
    <BaseEmptyState
      v-else
      :icon="IconClipboardList"
      title="No asset requests yet."
      description="Create a request to track documents needed from this supplier."
    />

    <SuppliersAssetRequestDialog
      v-model="showDialog"
      :supplierId="supplierId"
      :editingRequest="editingRequest"
      :contacts="contacts"
    />

    <SuppliersAssetRequestSubmitDialog v-model="showSubmitDialog" :request="submittingRequest" />

    <SuppliersAssetRequestReviewDialog
      v-model="showReviewDialog"
      :assetRequestId="reviewingRequestId"
    />
  </div>

  <BaseConfirmDialog
    v-if="confirmDialog"
    :modelValue="true"
    v-bind="confirmDialog"
    @update:modelValue="confirmDialog = null"
    @ok="confirmDialog?.onOk"
  />
</template>
