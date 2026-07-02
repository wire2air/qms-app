<script setup>
import { IconEdit, IconExternalLink } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

defineProps({
  rows: { type: Array, required: true },
  canUpdate: { type: Boolean, default: false },
})

const emit = defineEmits(['edit'])

// Option sources for the advanced filter's entity-column dropdowns.
const changeTypes = useLiveQuery((db) => db.ChangeType.where().exec(), {
  models: ['ChangeType'],
  initial: [],
})
const priorities = useLiveQuery((db) => db.ChangeRequestPriority.where().exec(), {
  models: ['ChangeRequestPriority'],
  initial: [],
})
const statuses = useLiveQuery((db) => db.ChangeRequestStatus.where().exec(), {
  models: ['ChangeRequestStatus'],
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
    changeType: { filterType: 'select', filterOptions: selectOpts(changeTypes.value) },
    priority: { filterType: 'select', filterOptions: selectOpts(priorities.value) },
    status: { filterType: 'select', filterOptions: selectOpts(statuses.value) },
    owner: { filterType: 'select', filterOptions: userOpts(users.value) },
    targetImplementationDate: { filterType: 'date' },
  }
  return [
    { name: 'crNumber', label: 'CR #', field: 'crNumber', align: 'left' },
    { name: 'title', label: 'Title', field: 'title', align: 'left' },
    { name: 'changeType', label: 'Type', align: 'left' },
    { name: 'priority', label: 'Priority', align: 'left' },
    { name: 'status', label: 'Status', align: 'left' },
    { name: 'owner', label: 'Owner', align: 'left' },
    { name: 'targetImplementationDate', label: 'Target Date', align: 'left' },
    { name: 'actions', label: '', align: 'right' },
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})
</script>

<template>
  <DataTable
    :rows="rows"
    :columns="columns"
    rowKey="id"
    :mobileCards="false"
    searchable
    filterable
    exportManager
    exportFilename="change-requests.csv"
  >
    <template #body-cell-crNumber="{ row }">
      <RouterLink
        :to="getCompanyPath(`/change-requests/${row.id}`)"
        class="tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
      >
        {{ row.crNumber || '—' }}
      </RouterLink>
    </template>

    <template #body-cell-title="{ row }">
      <RouterLink
        :to="getCompanyPath(`/change-requests/${row.id}`)"
        class="tw:text-sm tw:font-semibold tw:text-on-main tw:hover:text-primary"
      >
        {{ row.title }}
      </RouterLink>
    </template>

    <template #body-cell-changeType="{ row }">
      <ChangeTypeBadgeById :changeTypeId="row.changeTypeId" />
    </template>

    <template #body-cell-priority="{ row }">
      <ChangeRequestPriorityBadgeById :priorityId="row.priorityId" />
    </template>

    <template #body-cell-status="{ row }">
      <ChangeRequestStatusBadgeById :statusId="row.statusId" />
    </template>

    <template #body-cell-owner="{ row }">
      <UserBadgeById :userId="row.ownerId" />
    </template>

    <template #body-cell-targetImplementationDate="{ row }">
      <span class="tw:text-sm tw:text-on-main">
        {{ row.targetImplementationDate ? row.targetImplementationDate.formatDate('date') : '—' }}
      </span>
    </template>

    <template #body-cell-actions="{ row }">
      <div class="tw:flex tw:items-center tw:gap-2 tw:justify-end">
        <button
          v-if="canUpdate"
          class="tw:text-secondary tw:hover:text-primary tw:cursor-pointer"
          @click="emit('edit', row)"
        >
          <IconEdit :size="16" />
        </button>
        <RouterLink
          :to="getCompanyPath(`/change-requests/${row.id}`)"
          class="tw:text-secondary tw:hover:text-primary"
        >
          <IconExternalLink :size="16" />
        </RouterLink>
      </div>
    </template>
  </DataTable>
</template>
