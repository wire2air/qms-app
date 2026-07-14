<script setup>
// Platform Console — Tenant directory. Cross-tenant list of every company with
// lifecycle status. Read = support; status change = admin. Not syncEngine data
// (control plane, outside tenant RLS) — fetched via the platform action-RPC API.
import { IconBuildingCommunity, IconRefresh, IconDots } from '@tabler/icons-vue'
import { listCompanies } from '@/api/platform.js'
import { hasPlatformRole } from '@/utils/currentSession.js'

const router = useRouter()

const rows = ref([])
const loading = ref(false)
const canSetStatus = computed(() => hasPlatformRole('admin'))

const statusDialog = ref(false)
const selected = ref(null)

const columns = computed(() => [
  { name: 'name', label: 'TENANT', field: 'name', align: 'left', sortable: true },
  { name: 'code', label: 'CODE', field: 'code', align: 'left', sortable: true },
  { name: 'status', label: 'STATUS', field: 'status', align: 'left', sortable: true },
  { name: 'statusReason', label: 'REASON', field: 'statusReason', align: 'left' },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
  { name: 'actions', label: '', field: 'actions', align: 'right' },
])

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'name', desc: false }])

async function load() {
  loading.value = true
  try {
    const data = await listCompanies()
    rows.value = data?.companies || []
  } finally {
    loading.value = false
  }
}

onMounted(load)

function openTenant(row) {
  router.push(`/platform/companies/${row.id}`)
}

function openStatus(row) {
  selected.value = row
  statusDialog.value = true
}

function onStatusUpdated(newStatus) {
  if (selected.value) selected.value.status = newStatus
  load()
}

function rowMenuItems(row) {
  const items = [{ name: 'Open tenant', icon: IconBuildingCommunity, click: () => openTenant(row) }]
  if (canSetStatus.value) {
    items.push({ name: 'Set status…', icon: IconDots, click: () => openStatus(row) })
  }
  return items
}
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconBuildingCommunity" title="Tenants">
      <template #actions>
        <BaseButton variant="secondary" :disabled="loading" @click="load">
          <template #icon><IconRefresh :size="16" /></template>
          Refresh
        </BaseButton>
      </template>
    </PageHeader>

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
      exportFilename="tenants.csv"
      @rowClick="openTenant"
    >
      <template #body-cell-name="{ row }">
        <div class="tw:font-semibold tw:text-on-main">{{ row.name }}</div>
      </template>

      <template #body-cell-code="{ row }">
        <span class="tw:text-sm tw:text-secondary tw:font-mono">{{ row.code }}</span>
      </template>

      <template #body-cell-status="{ row }">
        <CompanyStatusBadge :status="row.status" />
      </template>

      <template #body-cell-statusReason="{ row }">
        <span class="tw:line-clamp-1 tw:max-w-xs tw:text-sm tw:text-secondary">
          {{ row.statusReason || '—' }}
        </span>
      </template>

      <template #body-cell-createdAt="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
      </template>

      <template #body-cell-actions="{ row }">
        <div class="tw:flex tw:justify-end" @click.stop>
          <BaseMenu :items="rowMenuItems(row)" />
        </div>
      </template>
    </DataTable>

    <CompanyStatusDialog
      v-model="statusDialog"
      :company="selected"
      @updated="onStatusUpdated"
    />
  </BasePage>
</template>
