<script setup>
// Vendor Access — the tenant's OWN read-only ledger of what platform operators
// (Wire2Air staff) did to/inside this workspace. Regulated-QMS transparency:
// answers "did the vendor touch my data, when, why?" from inside the tenant.
// Projected from platform_audit_log (target_company_id = this company).
import { IconShield } from '@tabler/icons-vue'
import { get } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

defineOptions({ name: 'VendorAccessLogPage' })
const pageInfo = usePageInfo()
pageInfo.value = { showHeader: true }

const entries = ref([])
const loading = ref(false)
const forbidden = ref(false)

const columns = [
  { name: 'occurredAt', label: 'WHEN', field: 'occurredAt', align: 'left', sortable: true },
  { name: 'label', label: 'ACTION', field: 'label', align: 'left', sortable: true },
  { name: 'operator', label: 'VENDOR OPERATOR', field: 'operator', align: 'left', sortable: true },
  { name: 'reason', label: 'REASON', field: 'reason', align: 'left' },
]
const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'occurredAt', desc: true }])

async function load() {
  try {
    const data = await get('/v1/services/vendor-access-log', { loader: loading, showError: false })
    entries.value = data?.entries || []
  } catch (err) {
    if (err?.status === 403) forbidden.value = true
  }
}
onMounted(load)
</script>

<template>
  <BasePage width="standard">
    <PageHeader :icon="IconShield" title="Vendor Access" />

    <BaseEmptyState
      v-if="forbidden"
      :icon="IconShield"
      title="Not available"
      description="You don't have permission to view vendor access."
    />

    <template v-else>
      <p class="tw:text-sm tw:text-secondary tw:mb-4">
        Every action taken on your workspace by Wire2Air platform staff — sign-ins, credential
        resets, status and plan changes — is recorded here for your audit trail.
      </p>

      <DataTable
        v-model:pagination="pagination"
        v-model:sort="sort"
        :rows="entries"
        :columns="columns"
        :loading="loading"
        rowKey="id"
        :mobileCards="false"
        searchable
        noDataLabel="No vendor access recorded."
      >
        <template #body-cell-occurredAt="{ row }">
          <span class="tw:text-sm tw:text-on-main">
            {{ row.occurredAt?.formatDate?.('datetime') || row.occurredAt }}
          </span>
        </template>
        <template #body-cell-label="{ row }">
          <span class="tw:font-medium tw:text-on-main">{{ row.label }}</span>
        </template>
        <template #body-cell-operator="{ row }">
          <span class="tw:text-sm tw:text-secondary">{{ row.operator }}</span>
        </template>
        <template #body-cell-reason="{ row }">
          <span class="tw:text-sm tw:text-secondary">{{ row.reason || '—' }}</span>
        </template>
      </DataTable>
    </template>
  </BasePage>
</template>
