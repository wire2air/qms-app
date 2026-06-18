<script setup>
import { IconDotsVertical, IconEye, IconArchive, IconArchiveOff } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({
  rows: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['view'])

const toast = useToast()

const canArchive = computed(() => isAllowed(['documents:delete']))

const confirmArchive = ref({ open: false, doc: null })

// current EFFECTIVE version for each document
const currentVersionMapById = useLiveQueryWithDeps(
  [() => props.rows.map((row) => row.id)],
  async (db, [ids]) => {
    if (ids.length === 0) return {}
    const versions = await db.DocumentVersion.where(
      '[documentId+statusId]',
      ids.map((id) => [id, 'EFFECTIVE']),
    ).exec()

    const map = {}
    for (const v of versions) map[v.documentId] = v
    return map
  },

  { models: ['DocumentVersion'], initial: {} },
)

const latestVersionMapById = useLiveQueryWithDeps(
  [() => props.rows.map((row) => row.id)],
  async (db, [ids]) => {
    if (ids.length === 0) return {}
    const versions = await db.DocumentVersion.where('documentId', ids)
      .where('isLatest', true)
      .exec()

    const map = {}
    for (const v of versions) {
      if (!map[v.documentId] || v.createdAt > map[v.documentId].createdAt) {
        map[v.documentId] = v
      }
    }
    return map
  },

  { models: ['DocumentVersion'], initial: {} },
)

const columns = computed(() => [
  {
    name: 'docNumber',
    label: 'DOC #',
    field: 'docNumber',
    align: 'left',
    sortable: true,
    hideable: false,
  },
  { name: 'title', label: 'TITLE', field: 'title', align: 'left', sortable: true },
  { name: 'department', label: 'DEPARTMENT', field: 'departmentId', align: 'left', sortable: true },
  {
    name: 'current',
    label: 'CURRENT',
    field: (row) => currentVersionMapById.value[row.id],
    align: 'left',
    sortable: false,
  },
  {
    name: 'latest',
    label: 'LATEST',
    field: (row) => latestVersionMapById.value[row.id],
    align: 'left',
    sortable: false,
  },
  {
    name: 'effectiveDate',
    label: 'EFFECTIVE DATE',
    field: (row) => latestVersionMapById.value[row.id]?.effectiveDate,
    align: 'left',
    sortable: false,
  },
  { name: 'owner', label: 'OWNER', field: 'owner', align: 'left', sortable: true },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
  { name: 'actions', label: 'ACTIONS', field: 'actions', align: 'right', hideable: false },
])

const pagination = ref({
  page: 1,
  rowsPerPage: 50,
  sortBy: 'createdAt',
  descending: true,
  total: null,
})

function getVersionLabel(version) {
  if (!version) return '-'
  return version.versionLabel || `${version.versionMajor}.${version.versionMinor}`
}

function onArchiveDocument(row) {
  confirmArchive.value = { open: true, doc: row }
}

async function confirmArchiveDocument() {
  const row = confirmArchive.value.doc
  if (!row) return
  row.statusId = 'ARCHIVED'
  await row.save()
  toast.success('Document archived successfully')
  confirmArchive.value = { open: false, doc: null }
}

async function onUnarchiveDocument(row) {
  row.statusId = 'ACTIVE'
  await row.save()
  toast.success('Document unarchived successfully')
}
</script>

<template>
  <BaseTable
    v-model:pagination="pagination"
    :rows="rows"
    :columns="columns"
    :loading="loading"
    columnToggle
    showDensityToggle
  >
    <!-- Doc Number Column -->
    <template #body-cell-docNumber="{ row }">
      <BaseBadge>{{ row.docNumber }}</BaseBadge>
    </template>

    <!-- Title Column -->
    <template #body-cell-title="{ row }">
      <div class="tw:flex tw:items-center tw:gap-2">
        <BaseClickableRow
          class="tw:font-bold tw:text-on-main tw:hover:text-primary"
          :aria-label="`View ${row.title}`"
          @click="emit('view', row)"
        >
          {{ row.title }}
        </BaseClickableRow>
        <span
          v-if="row.statusId === 'ARCHIVED'"
          class="tw:inline-flex tw:items-center tw:rounded tw:bg-amber-100 tw:px-1.5 tw:py-0.5 tw:text-xs tw:font-medium tw:text-amber-700 tw:ring-1 tw:ring-inset tw:ring-amber-600/20"
        >
          Archived
        </span>
      </div>
    </template>

    <!-- Department Column -->
    <template #body-cell-department="{ row }">
      <DepartmentBadgeById :departmentId="row.departmentId" />
    </template>

    <!-- Current Version Column -->
    <template #body-cell-current="{ row, value }">
      <DocumentsStatusBadge
        v-if="value"
        :version="getVersionLabel(value)"
        :status="row.statusId === 'ARCHIVED' ? 'ARCHIVED' : value.statusId"
      />
      <span v-else class="tw:text-sm tw:text-secondary">-</span>
    </template>

    <!-- Latest Version Column -->
    <template #body-cell-latest="{ value }">
      <DocumentsStatusBadge
        v-if="value"
        :version="getVersionLabel(value)"
        :status="value.statusId"
      />
      <span v-else class="tw:text-sm tw:text-secondary">-</span>
    </template>

    <!-- Effective Date Column -->
    <template #body-cell-effectiveDate="{ value }">
      <span class="tw:text-sm tw:text-secondary">{{ value?.formatDate('date') || '-' }}</span>
    </template>

    <!-- Owner Column -->
    <template #body-cell-owner="{ row }">
      <UserBadgeById :userId="row.userId" />
    </template>

    <!-- Created Column -->
    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>

    <!-- Actions Column -->
    <template #body-cell-actions="{ row }">
      <div class="tw:flex tw:justify-end">
        <BasePopover placement="bottom-end" :arrow="false">
          <template #button>
            <button
              class="tw:p-1.5 tw:rounded tw:hover:bg-main-hover tw:text-secondary tw:transition-colors"
            >
              <IconDotsVertical :size="16" />
            </button>
          </template>
          <template #content="{ close }">
            <div class="tw:flex tw:flex-col tw:py-1 tw:min-w-36">
              <button
                class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-on-sidebar tw:hover:bg-sidebar-hover tw:transition-colors"
                @click="(emit('view', row), close())"
              >
                <IconEye :size="16" class="tw:text-primary" />
                View
              </button>
              <button
                v-if="canArchive && row.statusId !== 'ARCHIVED'"
                class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-bad tw:hover:bg-sidebar-hover tw:transition-colors"
                @click="(onArchiveDocument(row), close())"
              >
                <IconArchive :size="16" />
                Archive
              </button>
              <button
                v-if="canArchive && row.statusId === 'ARCHIVED'"
                class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm tw:text-on-sidebar tw:hover:bg-sidebar-hover tw:transition-colors"
                @click="(onUnarchiveDocument(row), close())"
              >
                <IconArchiveOff :size="16" class="tw:text-primary" />
                Unarchive
              </button>
            </div>
          </template>
        </BasePopover>
      </div>
    </template>
  </BaseTable>

  <!-- Confirm Archive Dialog -->
  <BaseConfirmDialog
    v-model="confirmArchive.open"
    title="Confirm Archive"
    :message="`Are you sure you want to archive &quot;${confirmArchive.doc?.title}&quot; (${confirmArchive.doc?.docNumber})? This action will change the document status to Archived.`"
    okLabel="Archive"
    @ok="confirmArchiveDocument"
  />
</template>
