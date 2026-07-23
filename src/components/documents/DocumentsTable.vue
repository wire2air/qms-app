<script setup>
import { IconDotsVertical, IconEye, IconArchive } from '@tabler/icons-vue'
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

const canArchive = computed(() => isAllowed(['document_control:delete']))

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

// Option sources for the advanced filter's entity-column dropdowns.
const departments = useLiveQuery((db) => db.Department.where().exec(), {
  models: ['Department'],
  initial: [],
})
const users = useLiveQuery((db) => db.User.where().exec(), { models: ['User'], initial: [] })
function selectOpts(list) {
  return list.map((x) => ({ value: x.id, label: x.name }))
}
function userLabel(u) {
  return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email
}
function userOpts(list) {
  return list.map((u) => ({ value: u.id, label: userLabel(u) }))
}
// DC-L-03: id-column search must match the *name* the user sees, not the raw
// UUID/field value. These maps back the department/owner `searchValue` accessors.
const deptNameById = computed(() => Object.fromEntries(departments.value.map((d) => [d.id, d.name])))
const userNameById = computed(() => Object.fromEntries(users.value.map((u) => [u.id, userLabel(u)])))

const columns = computed(() => {
  const filterCfg = {
    department: { filterType: 'select', filterOptions: selectOpts(departments.value) },
    owner: { filterType: 'select', filterOptions: userOpts(users.value) },
    createdAt: { filterType: 'date' },
  }
  return [
    {
      name: 'docNumber',
      label: 'DOC #',
      field: 'docNumber',
      align: 'left',
      sortable: true,
      hideable: false,
    },
    { name: 'title', label: 'TITLE', field: 'title', align: 'left', sortable: true },
    {
      name: 'department',
      label: 'DEPARTMENT',
      field: 'departmentId',
      align: 'left',
      sortable: true,
      // DC-L-03: search matches the department name, not the departmentId UUID.
      searchValue: (row) => deptNameById.value[row.departmentId] ?? '',
    },
    {
      name: 'current',
      label: 'CURRENT',
      field: (row) => currentVersionMapById.value[row.id],
      align: 'left',
      sortable: false,
      // DC-L-03: a version object is not meaningfully free-text searchable
      // (status is covered by the Status filter) — keep it out of "Search in".
      searchable: false,
    },
    {
      name: 'latest',
      label: 'LATEST',
      field: (row) => latestVersionMapById.value[row.id],
      align: 'left',
      sortable: false,
      searchable: false,
    },
    {
      name: 'effectiveDate',
      label: 'EFFECTIVE DATE',
      field: (row) => latestVersionMapById.value[row.id]?.effectiveDate,
      align: 'left',
      sortable: false,
    },
    {
      name: 'owner',
      label: 'OWNER',
      // DC-L-03: the row's owner is `userId` (there is no `owner` field) — the
      // wrong field silently broke both Owner search and the Owner filter.
      field: 'userId',
      align: 'left',
      sortable: true,
      searchValue: (row) => userNameById.value[row.userId] ?? '',
    },
    { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
    { name: 'actions', label: 'ACTIONS', field: 'actions', align: 'right', hideable: false, searchable: false },
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'createdAt', desc: true }])

function getVersionLabel(version) {
  if (!version) return '-'
  return version.versionLabel || `${version.versionMajor}.${version.versionMinor}`
}

// Archiving a controlled document is a regulated event (H7) — route the
// list-view Archive through the SAME obsoletion dialog the detail page uses, so
// a reason is captured + audited (soft-delete stamping obsoletedAt/By/reason),
// instead of a bare, reason-less, reversible status flip. List-view unarchive is
// removed with this — obsoletion is a deliberate, audited retirement.
const obsoletionTarget = ref(null)
const showObsoletionDialog = ref(false)

function onArchiveDocument(row) {
  obsoletionTarget.value = row
  showObsoletionDialog.value = true
}

function onObsoleted() {
  // The dialog performs the mutation + soft-delete; the list refreshes itself
  // via syncBus. Acknowledge and clear the target.
  toast.success('Document archived successfully')
  obsoletionTarget.value = null
}
</script>

<template>
  <DataTable
    v-model:pagination="pagination"
    v-model:sort="sort"
    :rows="rows"
    :columns="columns"
    :loading="loading"
    :mobileCards="false"
    searchable
    columnManager
    densitySelector
    filterable
    exportManager
    exportFilename="documents.csv"
    persistKey="documents"
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
            </div>
          </template>
        </BasePopover>
      </div>
    </template>
  </DataTable>

  <DocumentObsoletionDialog
    v-model="showObsoletionDialog"
    :document="obsoletionTarget"
    :documentTitle="obsoletionTarget?.title"
    :documentNumber="obsoletionTarget?.docNumber"
    @archived="onObsoleted"
  />
</template>
