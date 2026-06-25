<script setup>
import { IconBan } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { DateTime } from 'luxon'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  canManage: { type: Boolean, default: false },
})

const toast = useToast()

const columns = computed(() => {
  const filterCfg = {
    status: {
      filterType: 'select',
      filterOptions: [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'PENDING_VERIFICATION', label: 'Pending Verification' },
        { value: 'COMPLETED', label: 'Completed' },
        { value: 'CANCELLED', label: 'Cancelled' },
      ],
    },
    dueDate: { filterType: 'date' },
    createdAt: { filterType: 'date' },
  }
  return [
    { name: 'title', label: 'TRAINING', field: 'snapshot', align: 'left', sortable: false },
    { name: 'status', label: 'STATUS', field: 'status', align: 'left', sortable: false },
    { name: 'dueDate', label: 'DUE DATE', field: 'dueDate', align: 'left', sortable: true },
    { name: 'createdAt', label: 'LAUNCHED', field: 'createdAt', align: 'left', sortable: true },
    { name: 'actions', label: '', field: 'actions', align: 'right' },
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'createdAt', desc: true }])

function isOverdue(row) {
  if (!row.dueDate || row.status !== 'ACTIVE') return false
  const due = row.dueDate instanceof DateTime ? row.dueDate : DateTime.fromISO(row.dueDate)
  return due < DateTime.now()
}

async function handleCancel(row) {
  try {
    await post(`/v1/services/trainingInstances/${row.id}/cancel`, {})
  } catch (err) {
    toast.notify({ type: 'negative', message: err.message || 'Failed to cancel' })
  }
}

function rowMenuItems(row) {
  if (!props.canManage || row.status !== 'ACTIVE') return []
  return [{ name: 'Cancel', icon: IconBan, click: () => handleCancel(row) }]
}
</script>

<template>
  <DataTable
    v-model:pagination="pagination"
    v-model:sort="sort"
    :rows="rows"
    :columns="columns"
    rowKey="id"
    :mobileCards="false"
    filterable
  >
    <template #body-cell-title="{ row }">
      <RouterLink
        :to="getCompanyPath(`/training-instances/${row.id}`)"
        class="tw:font-medium tw:text-on-main tw:hover:text-primary"
      >
        {{ row.snapshot?.title || '—' }}
      </RouterLink>
    </template>

    <template #body-cell-status="{ row }">
      <div class="tw:flex tw:items-center tw:gap-2">
        <TrainingInstanceStatusBadgeById :statusId="row.status" />
        <span v-if="isOverdue(row)" class="tw:text-xs tw:text-red-600 tw:font-medium">Overdue</span>
      </div>
    </template>

    <template #body-cell-dueDate="{ row }">
      <span class="tw:text-sm" :class="isOverdue(row) ? 'tw:text-red-600' : 'tw:text-secondary'">
        {{ row.dueDate ? row.dueDate.formatDate('date') : '—' }}
      </span>
    </template>

    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>

    <template #body-cell-actions="{ row }">
      <BaseRowMenu :items="rowMenuItems(row)" />
    </template>
  </DataTable>
</template>
