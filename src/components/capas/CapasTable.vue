<script setup>
import { IconEdit, IconTrash } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { DateTime } from 'luxon'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  canUpdate: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
})

const emit = defineEmits(['delete', 'edit'])

const priorityDotClass = {
  CRITICAL: 'tw:bg-red-500',
  HIGH: 'tw:bg-amber-500',
  MEDIUM: 'tw:bg-blue-500',
  LOW: 'tw:bg-green-500',
}

function isOverdue(row) {
  if (!row.dueDate || row.statusId === 'CLOSED') return false
  return row.dueDate < DateTime.now()
}

const columns = [
  { name: 'capaNumber', label: 'CAPA NUMBER', field: 'capaNumber', align: 'left', sortable: true },
  { name: 'title', label: 'TITLE', field: 'title', align: 'left', sortable: true },
  { name: 'priority', label: 'PRIORITY', field: 'priorityId', align: 'left', sortable: false },
  { name: 'status', label: 'STATUS', field: 'statusId', align: 'left', sortable: false },
  { name: 'type', label: 'TYPE', field: 'typeId', align: 'left', sortable: false },
  {
    name: 'effectivenessCheck',
    label: 'EFFECTIVENESS CHECK',
    field: 'effectivenessCheck',
    align: 'left',
    sortable: false,
  },
  {
    name: 'scheduledCycle',
    label: 'CYCLE',
    field: 'scheduledCycle',
    align: 'left',
    sortable: false,
  },
  { name: 'dueDate', label: 'DUE DATE', field: 'dueDate', align: 'left', sortable: true },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

function formatCycle(cycle) {
  if (!cycle?.value || !cycle?.unit) return null
  const unit = String(cycle.unit).toLowerCase()
  return `${cycle.value} ${unit}`
}

const pagination = ref({
  page: 1,
  rowsPerPage: 50,
  sortBy: 'createdAt',
  descending: true,
  total: null,
})

function rowMenuItems(row) {
  const items = []
  if (props.canUpdate) {
    items.push({ name: 'Edit', icon: IconEdit, click: () => emit('edit', row) })
  }
  if (props.canDelete) {
    items.push({ name: 'Delete', icon: IconTrash, click: () => emit('delete', row) })
  }
  return items
}
</script>

<template>
  <BaseTable v-model:pagination="pagination" :rows="rows" :columns="columns" rowKey="id">
    <template #body-cell-capaNumber="{ row }">
      <RouterLink
        :to="getCompanyPath(`/capas/${row.id}`)"
        class="tw:font-mono tw:text-xs tw:text-secondary tw:hover:text-primary"
      >
        {{ row.capaNumber || '—' }}
      </RouterLink>
    </template>

    <template #body-cell-title="{ row }">
      <RouterLink
        :to="getCompanyPath(`/capas/${row.id}`)"
        class="tw:flex tw:items-center tw:gap-2 tw:text-on-main tw:hover:text-primary"
      >
        <span
          class="tw:inline-block tw:w-2 tw:h-2 tw:rounded-full tw:shrink-0"
          :class="priorityDotClass[row.priorityId] || 'tw:bg-gray-400'"
        />
        <span class="tw:font-medium">{{ row.title }}</span>
      </RouterLink>
    </template>

    <template #body-cell-priority="{ row }">
      <CapaPriorityBadgeById :priorityId="row.priorityId" />
    </template>

    <template #body-cell-status="{ row }">
      <CapaStatusBadgeById :statusId="row.statusId" />
    </template>

    <template #body-cell-type="{ row }">
      <CapaTypeBadgeById :typeId="row.typeId" />
    </template>

    <template #body-cell-effectivenessCheck="{ row }">
      <span v-if="row.effectivenessCheck?.status" class="tw:text-sm tw:font-medium tw:text-on-main">
        {{ row.effectivenessCheck.status }}
      </span>
      <span v-else class="tw:text-secondary">—</span>
    </template>

    <template #body-cell-scheduledCycle="{ row }">
      <span v-if="formatCycle(row.scheduledCycle)" class="tw:text-sm tw:text-secondary">
        {{ formatCycle(row.scheduledCycle) }}
      </span>
      <span v-else class="tw:text-secondary">—</span>
    </template>

    <template #body-cell-dueDate="{ row }">
      <span
        v-if="row.dueDate"
        :class="isOverdue(row) ? 'tw:text-red-600 tw:font-semibold' : 'tw:text-secondary'"
      >
        {{ row.dueDate.formatDate('date') }}
        <span v-if="isOverdue(row)">↑</span>
      </span>
      <span v-else class="tw:text-secondary">—</span>
    </template>

    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>

    <template #body-cell-actions="{ row }">
      <div v-if="rowMenuItems(row).length" class="tw:flex tw:justify-end">
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </BaseTable>
</template>
