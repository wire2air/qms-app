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

const severityDotClass = {
  CRITICAL: 'tw:bg-red-500',
  MAJOR: 'tw:bg-amber-500',
  MINOR: 'tw:bg-green-500',
}

function isOverdue(row) {
  if (!row.dueDate || row.statusId === 'CLOSED' || row.statusId === 'VOID') return false
  return row.dueDate < DateTime.now()
}

const columns = [
  { name: 'ncNumber', label: 'NC NUMBER', field: 'ncNumber', align: 'left', sortable: true, hideable: false },
  { name: 'title', label: 'TITLE', field: 'title', align: 'left', sortable: true },
  { name: 'severity', label: 'SEVERITY', field: 'severityId', align: 'left', sortable: false },
  { name: 'status', label: 'STATUS', field: 'statusId', align: 'left', sortable: false },
  { name: 'type', label: 'TYPE', field: 'typeId', align: 'left', sortable: false },
  { name: 'dueDate', label: 'DUE DATE', field: 'dueDate', align: 'left', sortable: true },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
]

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
  <BaseTable
    v-model:pagination="pagination"
    :rows="rows"
    :columns="columns"
    rowKey="id"
    columnToggle
    showDensityToggle
  >
    <template #body-cell-ncNumber="{ row }">
      <RouterLink
        :to="getCompanyPath(`/nonconformances/${row.id}`)"
        class="tw:font-mono tw:text-xs tw:text-secondary tw:hover:text-primary"
      >
        {{ row.ncNumber || '—' }}
      </RouterLink>
    </template>

    <template #body-cell-title="{ row }">
      <RouterLink
        :to="getCompanyPath(`/nonconformances/${row.id}`)"
        class="tw:flex tw:items-center tw:gap-2 tw:text-on-main tw:hover:text-primary"
      >
        <span
          class="tw:inline-block tw:w-2 tw:h-2 tw:rounded-full tw:shrink-0"
          :class="severityDotClass[row.severityId] || 'tw:bg-gray-400'"
        />
        <span class="tw:font-medium">{{ row.title }}</span>
      </RouterLink>
    </template>

    <template #body-cell-severity="{ row }">
      <NcSeverityBadgeById :severityId="row.severityId" />
    </template>

    <template #body-cell-status="{ row }">
      <NcStatusBadgeById :statusId="row.statusId" />
    </template>

    <template #body-cell-type="{ row }">
      <NcTypeBadgeById :typeId="row.typeId" />
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
