<script setup>
import { IconCircleCheck, IconArrowBack } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession'

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

// Records F-13. The Approve / Unapprove menu below is the ONLY affordance in
// the product that writes records.status_id, and it was offered to every user
// who could see the table. `records:update` is the permission the write itself
// needs — the SyncEngine mutation goes out over GraphQL as app_user, where
// record_update_rls requires exactly that — so a user without it was shown a
// menu item whose only possible outcome was a failed save. Same computed the
// sibling submissions view already uses (formTemplateRecords.vue:350).
const canUpdate = computed(() => isAllowed(['records:update']))

// Menu items, built as a function rather than inline in the template so the
// permission check reads once and the empty case is expressible: with no items
// the menu is not rendered at all, which is the house pattern
// (NonconformancesTable.vue rowMenuItems, CapasTable.vue rowMenuItems).
function rowMenuItems(row) {
  if (!canUpdate.value) return []
  if (row.statusId === 'DRAFT') {
    return [
      {
        name: 'Approve',
        icon: IconCircleCheck,
        click: () => updateRecord({ id: row.id, updates: { statusId: 'APPROVED' } }),
      },
    ]
  }
  if (row.statusId === 'APPROVED') {
    return [
      {
        name: 'Unapprove',
        icon: IconArrowBack,
        click: () => updateRecord({ id: row.id, updates: { statusId: 'DRAFT' } }),
      },
    ]
  }
  return []
}

const updateRecord = useLiveMutation(async (db, { id, updates }) => {
  const record = await db.Record.findByPk(id)
  if (!record) throw new Error('Record not found')
  Object.assign(record, updates)
  await record.save()
  return record
})

// Option sources for the advanced filter's entity-column dropdowns.
const documentTypes = useLiveQuery((db) => db.DocumentType.where().exec(), {
  models: ['DocumentType'],
  initial: [],
})
const recordStatuses = useLiveQuery((db) => db.RecordStatus.where().exec(), {
  models: ['RecordStatus'],
  initial: [],
})
const users = useLiveQuery((db) => db.User.where().exec(), { models: ['User'], initial: [] })
function selectOpts(list) {
  return list.map((x) => ({ value: x.id, label: x.name }))
}
function userOpts(list) {
  return list.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}`.trim() || u.email }))
}

const columns = computed(() => {
  const filterCfg = {
    documentTypeId: { filterType: 'select', filterOptions: selectOpts(documentTypes.value) },
    statusId: { filterType: 'select', filterOptions: selectOpts(recordStatuses.value) },
    createdBy: { filterType: 'select', filterOptions: userOpts(users.value) },
    createdAt: { filterType: 'date' },
  }
  return [
    {
      name: 'recordNumber',
      label: 'RECORD #',
      field: 'recordNumber',
      align: 'left',
      sortable: true,
    },
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
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'createdAt', desc: true }])
</script>

<template>
  <DataTable
    v-model:pagination="pagination"
    v-model:sort="sort"
    :rows="rows"
    :columns="columns"
    :loading="loading"
    hidePagination
    :mobileCards="false"
    searchable
    filterable
    exportManager
    exportFilename="records.csv"
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
      <div v-if="rowMenuItems(row).length" class="tw:flex tw:justify-end" @click.prevent.stop>
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </DataTable>

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
