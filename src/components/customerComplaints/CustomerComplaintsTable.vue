<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  rows: { type: Array, default: () => [] },
  selectable: { type: Boolean, default: false },
  canUpdate: { type: Boolean, default: false },
})

defineEmits(['open'])

// Multi-select feeds the bulk Convert-to-NC action. Already-converted
// complaints can't be part of a second conversion batch.
const selected = defineModel('selected', { type: Array, default: () => [] })

function isSelectable(row) {
  return row.statusId !== 'CONVERTED_TO_NC'
}

function toggleRow(row) {
  if (!isSelectable(row)) return
  if (selected.value.includes(row.id)) {
    selected.value = selected.value.filter((id) => id !== row.id)
  } else {
    selected.value = [...selected.value, row.id]
  }
}

const columns = computed(() => [
  ...(props.selectable
    ? [{ name: 'select', label: '', field: 'select', align: 'left' }]
    : []),
  {
    name: 'complaintNumber',
    label: 'TICKET',
    field: 'complaintNumber',
    align: 'left',
    sortable: true,
  },
  { name: 'subject', label: 'SUBJECT', field: 'subject', align: 'left', sortable: true },
  { name: 'customer', label: 'CUSTOMER', field: 'customerName', align: 'left', sortable: true },
  { name: 'source', label: 'SOURCE', field: 'sourceId', align: 'left', sortable: false },
  { name: 'priority', label: 'PRIORITY', field: 'priorityId', align: 'left', sortable: false },
  { name: 'assignedTo', label: 'ASSIGNED', field: 'assignedTo', align: 'left', sortable: false },
  { name: 'status', label: 'STATUS', field: 'statusId', align: 'left', sortable: false },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
])

const pagination = ref({
  page: 1,
  rowsPerPage: 50,
  sortBy: 'createdAt',
  descending: true,
  total: null,
})
</script>

<template>
  <BaseTable v-model:pagination="pagination" :rows="rows" :columns="columns" rowKey="id">
    <template #body-cell-select="{ row }">
      <BaseCheckbox
        :modelValue="selected.includes(row.id)"
        :disabled="!isSelectable(row)"
        @update:modelValue="() => toggleRow(row)"
      />
    </template>

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
        class="tw:flex tw:items-center tw:gap-2 tw:text-on-main tw:hover:text-primary"
      >
        <span class="tw:font-medium">{{ row.subject }}</span>
      </RouterLink>
    </template>

    <template #body-cell-customer="{ row }">
      <div class="tw:flex tw:flex-col">
        <span class="tw:text-sm tw:font-medium">{{ row.customerName || '—' }}</span>
        <span v-if="row.customerEmail" class="tw:text-xs tw:text-secondary">
          {{ row.customerEmail }}
        </span>
      </div>
    </template>

    <template #body-cell-source="{ row }">
      <CustomerComplaintSourceBadgeById :sourceId="row.sourceId" />
    </template>

    <template #body-cell-priority="{ row }">
      <CustomerComplaintPriorityBadgeById v-if="row.priorityId" :priorityId="row.priorityId" />
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </template>

    <template #body-cell-assignedTo="{ row }">
      <UserBadgeById v-if="row.assignedTo" :userId="row.assignedTo" />
      <span v-else class="tw:text-sm tw:text-secondary tw:italic">Unassigned</span>
    </template>

    <template #body-cell-status="{ row }">
      <CustomerComplaintStatusBadgeById :statusId="row.statusId" />
    </template>

    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>
  </BaseTable>
</template>
