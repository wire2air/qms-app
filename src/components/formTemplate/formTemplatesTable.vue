<script setup>
import { IconEye, IconEdit, IconBrush, IconTrash } from '@tabler/icons-vue'
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

const emit = defineEmits(['delete'])

const router = useRouter()

const showPreviewDialog = ref(false)
const previewTemplate = ref(null)

// Option sources for the advanced filter's entity-column dropdowns.
const formStatuses = useLiveQuery((db) => db.FormStatus.where().exec(), {
  models: ['FormStatus'],
  initial: [],
})
function selectOpts(list) {
  return list.map((x) => ({ value: x.id, label: x.name }))
}

const columns = computed(() => {
  const filterCfg = {
    statusId: { filterType: 'select', filterOptions: selectOpts(formStatuses.value) },
    createdAt: { filterType: 'date' },
  }
  return [
    { name: 'title', label: 'TEMPLATE NAME', field: 'title', align: 'left', sortable: true },
    { name: 'version', label: 'VERSION', field: 'version', align: 'left', sortable: true },
    { name: 'statusId', label: 'STATUS', field: 'statusId', align: 'left', sortable: true },
    { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
    { name: 'actions', label: '', field: 'actions', align: 'right' },
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'createdAt', desc: true }])

const previewSchema = computed(() => {
  if (!previewTemplate.value?.schema) return []
  return Array.isArray(previewTemplate.value.schema) ? previewTemplate.value.schema : []
})

const previewTitle = computed(() => {
  if (!previewTemplate.value) return 'Form Preview'
  return `Preview: ${previewTemplate.value.title} (v${previewTemplate.value.version})`
})

function navigateToTemplate(row, mode) {
  const path = getCompanyPath(`/templates/${row.id}`)
  const query = mode ? { mode } : undefined
  router.push({ path, query })
}

function openPreview(row) {
  previewTemplate.value = row
  showPreviewDialog.value = true
}

function rowMenuItems(row) {
  const items = [{ name: 'View', icon: IconEye, click: () => navigateToTemplate(row) }]
  if (props.canUpdate) {
    items.push({ name: 'Design', icon: IconBrush, click: () => navigateToTemplate(row, 'schema') })
  }
  items.push({ name: 'Preview', icon: IconEdit, click: () => openPreview(row) })
  if (props.canDelete) {
    items.push({ name: 'Delete', icon: IconTrash, click: () => emit('delete', row) })
  }
  return items
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
    exportManager
    exportFilename="form-templates.csv"
  >
    <!-- Title Column -->
    <template #body-cell-title="{ row }">
      <BaseClickableRow
        class="tw:flex tw:flex-col"
        :to="getCompanyPath(`/templates/${row.id}`)"
        :aria-label="`Open template ${row.title}`"
      >
        <span class="tw:font-bold tw:text-on-main">{{ row.title }}</span>
        <span class="tw:text-xs tw:text-secondary">{{ row.code }}</span>
      </BaseClickableRow>
    </template>

    <!-- Version Column -->
    <template #body-cell-version="{ row }">
      <span class="tw:text-sm tw:text-secondary">v{{ row.version }}</span>
    </template>

    <!-- Status Column -->
    <template #body-cell-statusId="{ row }">
      <FormTemplateStatusBadgeById :statusId="row.statusId" />
    </template>

    <!-- Created At Column -->
    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>

    <!-- Actions Column -->
    <template #body-cell-actions="{ row }">
      <div class="tw:flex tw:justify-end">
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </DataTable>

  <!-- Preview Dialog -->
  <BaseDialog v-model="showPreviewDialog" maxWidth="full">
    <FormTemplatePreview
      :title="previewTitle"
      :schema="previewSchema"
      @submit="showPreviewDialog = false"
      @close="showPreviewDialog = false"
    />
  </BaseDialog>
</template>
