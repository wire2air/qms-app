<script setup>
import { IconTrash } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  canDelete: { type: Boolean, default: false },
})

const emit = defineEmits(['delete'])

const columns = [
  {
    name: 'complaintNumber',
    label: 'TICKET',
    field: 'complaintNumber',
    align: 'left',
    sortable: true,
  },
  { name: 'subject', label: 'SUBJECT', field: 'subject', align: 'left', sortable: true },
  { name: 'customer', label: 'CUSTOMER', field: 'customerEmail', align: 'left', sortable: false },
  { name: 'status', label: 'STATUS', field: 'statusId', align: 'left', sortable: false },
  { name: 'priority', label: 'PRIORITY', field: 'priorityId', align: 'left', sortable: false },
  { name: 'source', label: 'SOURCE', field: 'sourceId', align: 'left', sortable: false },
  { name: 'assignee', label: 'ASSIGNEE', field: 'assignedToUserId', align: 'left' },
  { name: 'createdAt', label: 'OPENED', field: 'createdAt', align: 'left', sortable: true },
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
  if (props.canDelete) {
    items.push({ name: 'Delete', icon: IconTrash, click: () => emit('delete', row) })
  }
  return items
}
</script>

<template>
  <BaseTable v-model:pagination="pagination" :rows="rows" :columns="columns" rowKey="id">
    <template #body-cell-complaintNumber="{ row }">
      <RouterLink
        :to="getCompanyPath(`/customer-complaints/${row.id}`)"
        class="tw:font-mono tw:text-xs tw:text-secondary tw:hover:text-primary"
      >
        {{ row.complaintNumber || '—' }}
      </RouterLink>
    </template>

    <template #body-cell-subject="{ row }">
      <RouterLink
        :to="getCompanyPath(`/customer-complaints/${row.id}`)"
        class="tw:text-on-main tw:hover:text-primary tw:font-medium"
      >
        {{ row.subject }}
      </RouterLink>
    </template>

    <template #body-cell-customer="{ row }">
      <div class="tw:flex tw:flex-col">
        <span class="tw:text-sm">{{ row.customerName || row.customerEmail || '—' }}</span>
        <span v-if="row.customerName && row.customerEmail" class="tw:text-xs tw:text-secondary">
          {{ row.customerEmail }}
        </span>
      </div>
    </template>

    <template #body-cell-status="{ row }">
      <CustomerComplaintStatusBadgeById :statusId="row.statusId" />
    </template>

    <template #body-cell-priority="{ row }">
      <CustomerComplaintPriorityBadgeById :priorityId="row.priorityId" />
    </template>

    <template #body-cell-source="{ row }">
      <CustomerComplaintSourceBadgeById :sourceId="row.sourceId" />
    </template>

    <template #body-cell-assignee="{ row }">
      <UserBadgeById v-if="row.assignedToUserId" :userId="row.assignedToUserId" />
      <span v-else class="tw:text-xs tw:text-secondary tw:italic">Unassigned</span>
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
