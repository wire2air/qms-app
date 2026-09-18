<script setup>
import { IconCircleCheck, IconBan, IconCopy, IconLock } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  rows: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  canUpdate: {
    type: Boolean,
    default: false,
  },
  canCreate: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['activate', 'deactivate', 'clone'])

const router = useRouter()

const columns = computed(() => {
  const filterCfg = {
    updatedAt: { filterType: 'date' },
  }
  return [
    { name: 'name', label: 'ROLE NAME', field: 'name', align: 'left', sortable: true },
    { name: 'description', label: 'DESCRIPTION', field: 'description', align: 'left' },
    { name: 'userCount', label: 'USERS', field: 'userCount', align: 'left', sortable: true },
    { name: 'statusId', label: 'STATUS', field: 'statusId', align: 'left', sortable: true },
    { name: 'updatedAt', label: 'LAST MODIFIED', field: 'updatedAt', align: 'left', sortable: true },
    { name: 'actions', label: '', field: 'actions', align: 'right' },
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'name', desc: false }])

function openRole(row) {
  router.push(getCompanyPath(`/roles/${row.id}`))
}

function rowMenuItems(row) {
  const items = []
  if (props.canCreate) {
    items.push({ name: 'Clone Role', icon: IconCopy, click: () => emit('clone', row) })
  }
  // A locked role is protected — no status changes until it's unlocked.
  if (props.canUpdate && !row.locked) {
    items.push(
      row.statusId === 'INACTIVE'
        ? { name: 'Activate Role', icon: IconCircleCheck, click: () => emit('activate', row) }
        : { name: 'Deactivate Role', icon: IconBan, click: () => emit('deactivate', row) },
    )
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
    :loading="loading"
    rowKey="id"
    :mobileCards="false"
    searchable
    filterable
    exportManager
    exportFilename="roles.csv"
    @rowClick="openRole"
  >
    <template #body-cell-name="{ row }">
      <div class="tw:flex tw:items-center tw:gap-1.5">
        <span class="tw:font-semibold tw:text-on-main">{{ row.name }}</span>
        <IconLock
          v-if="row.locked"
          :size="14"
          class="tw:text-amber-600"
          title="Locked — protected from edits"
        />
      </div>
    </template>

    <template #body-cell-description="{ row }">
      <span class="tw:line-clamp-1 tw:max-w-md tw:text-sm tw:text-secondary">
        {{ row.description || '—' }}
      </span>
    </template>

    <template #body-cell-userCount="{ row }">
      <span class="tw:text-sm tw:text-on-main">{{ row.userCount || 0 }}</span>
    </template>

    <template #body-cell-statusId="{ row }">
      <RoleStatusBadge v-if="row.statusId" :status="row.statusId" />
    </template>

    <template #body-cell-updatedAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.updatedAt?.formatDate('date') }}</span>
    </template>

    <template #body-cell-actions="{ row }">
      <div v-if="canUpdate || canCreate" class="tw:flex tw:justify-end">
        <BaseMenu :items="rowMenuItems(row)" />
      </div>
    </template>
  </DataTable>
</template>
