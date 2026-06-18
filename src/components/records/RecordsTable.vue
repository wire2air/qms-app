<script setup>
import { IconCircleCheck, IconArrowBack } from '@tabler/icons-vue'

defineProps({
  rows: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const previewDialog = ref(false)
const selectedRecordId = ref(null)

function openPreview(row) {
  selectedRecordId.value = row.id
  previewDialog.value = true
}

function closePreview() {
  previewDialog.value = false
  selectedRecordId.value = null
}

const updateRecord = useLiveMutation(async (db, { id, updates }) => {
  const record = await db.Record.findByPk(id)
  if (!record) throw new Error('Record not found')
  Object.assign(record, updates)
  await record.save()
  return record
})

const columns = [
  { name: 'recordNumber', label: 'RECORD #', field: 'recordNumber', align: 'left', sortable: true },
  {
    name: 'documentTypeId',
    label: 'DOCUMENT TYPE',
    field: 'documentTypeId',
    align: 'left',
    sortable: true,
  },
  { name: 'statusId', label: 'STATUS', field: 'statusId', align: 'left', sortable: true },
  { name: 'createdBy', label: 'CREATED BY', field: 'userId', align: 'left', sortable: false },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
  { name: 'actions', label: 'ACTIONS', field: 'actions', align: 'right', sortable: false },
]

const pagination = ref({
  page: 1,
  rowsPerPage: 50,
  sortBy: 'createdAt',
  descending: true,
  total: null,
})
</script>

<template>
  <BaseTable
    v-model:pagination="pagination"
    :rows="rows"
    :columns="columns"
    :loading="loading"
    hidePagination
    @rowClick="openPreview"
  >
    <!-- Record Number Column -->
    <template #body-cell-recordNumber="{ row }">
      <span class="tw:font-bold">{{ row.recordNumber }}</span>
    </template>

    <!-- Document Type Column -->
    <template #body-cell-documentTypeId="{ row }">
      <DocumentTypeBadgeById :documentTypeId="row.documentTypeId" :iconOnly="false" />
    </template>

    <!-- Status Column -->
    <template #body-cell-statusId="{ row }">
      <RecordStatusBadgeById :statusId="row.statusId" />
    </template>

    <!-- Created By Column -->
    <template #body-cell-createdBy="{ row }">
      <UserBadgeById :userId="row.userId" />
    </template>

    <!-- Created At Column -->
    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>

    <!-- Actions Column -->
    <template #body-cell-actions="{ row }">
      <div class="tw:flex tw:justify-end" @click.prevent.stop>
        <BaseMenu
          :items="[
            ...(row.statusId === 'DRAFT'
              ? [
                  {
                    name: 'Approve',
                    icon: IconCircleCheck,
                    click: () => updateRecord({ id: row.id, updates: { statusId: 'APPROVED' } }),
                  },
                ]
              : []),
            ...(row.statusId === 'APPROVED'
              ? [
                  {
                    name: 'Unapprove',
                    icon: IconArrowBack,
                    click: () => updateRecord({ id: row.id, updates: { statusId: 'DRAFT' } }),
                  },
                ]
              : []),
          ]"
        />
      </div>
    </template>
  </BaseTable>

  <!-- Preview Panel -->
  <Teleport to="body">
    <Transition
      enterActiveClass="tw:transition-transform tw:duration-300 tw:ease-out"
      enterFromClass="tw:translate-x-full"
      enterToClass="tw:translate-x-0"
      leaveActiveClass="tw:transition-transform tw:duration-200 tw:ease-in"
      leaveFromClass="tw:translate-x-0"
      leaveToClass="tw:translate-x-full"
    >
      <div v-if="previewDialog" class="tw:fixed tw:inset-0 tw:z-modal tw:bg-sidebar">
        <RecordPreview :recordId="selectedRecordId" @close="closePreview" />
      </div>
    </Transition>
  </Teleport>
</template>
