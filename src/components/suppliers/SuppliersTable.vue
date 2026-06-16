<script setup>
import { IconEdit, IconTrash } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  rows: {
    type: Array,
    default: () => [],
  },
  canUpdate: {
    type: Boolean,
    default: false,
  },
  canDelete: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['delete', 'edit'])

const columns = [
  { name: 'name', label: 'SUPPLIER NAME', field: 'name', align: 'left', sortable: true, hideable: false },
  { name: 'code', label: 'CODE', field: 'code', align: 'left', sortable: true },
  { name: 'category', label: 'CATEGORY', field: 'category', align: 'left', sortable: true },
  { name: 'riskLevel', label: 'RISK LEVEL', field: 'riskLevel', align: 'left', sortable: true },
  { name: 'status', label: 'STATUS', field: 'statusId', align: 'left', sortable: true },
  {
    name: 'lastEvaluation',
    label: 'LAST EVALUATION',
    field: 'lastEvaluationDate',
    align: 'left',
    sortable: true,
  },
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

function getInitials(name) {
  if (!name) return '??'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

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
    <!-- Name Column -->
    <template #body-cell-name="{ row }">
      <RouterLink
        class="tw:flex tw:items-center tw:gap-3"
        :to="getCompanyPath(`/suppliers/${row.id}`)"
      >
        <div
          class="tw:w-8 tw:h-8 tw:rounded-full tw:bg-primary-container tw:flex tw:items-center tw:justify-center tw:text-primary tw:font-bold tw:text-xs"
        >
          {{ getInitials(row.name) }}
        </div>
        <div class="tw:font-bold tw:text-on-main">{{ row.name }}</div>
      </RouterLink>
    </template>

    <!-- Code Column -->
    <template #body-cell-code="{ row }">
      <span
        class="tw:inline-flex tw:items-center tw:rounded tw:border tw:border-primary tw:px-2 tw:py-0.5 tw:text-xs tw:font-mono tw:font-medium tw:text-primary"
        >{{ row.code }}</span
      >
    </template>

    <!-- Category Column -->
    <template #body-cell-category="{ row }">
      <SupplierCategoryBadge v-if="row.category" :categoryId="row.category" />
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </template>

    <!-- Risk Level Column -->
    <template #body-cell-riskLevel="{ row }">
      <SupplierRiskLevelBadge v-if="row.riskLevel" :riskLevelId="row.riskLevel" />
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </template>

    <!-- Status Column -->
    <template #body-cell-status="{ row }">
      <SupplierStatusBadgeById v-if="row.statusId" :statusId="row.statusId" />
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </template>

    <!-- Created Column -->
    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>

    <!-- Last Evaluation Column -->
    <template #body-cell-lastEvaluation="{ row }">
      <span class="tw:text-sm tw:text-secondary">
        {{ row.lastEvaluationDate ? row.lastEvaluationDate.formatDate('date') : '—' }}
      </span>
    </template>

    <!-- Actions Column -->
    <template #body-cell-actions="{ row }">
      <div v-if="canUpdate || canDelete" class="tw:flex tw:justify-end">
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </BaseTable>
</template>
