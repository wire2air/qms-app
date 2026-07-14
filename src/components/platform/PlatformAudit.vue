<script setup>
// Platform Console — Audit trail. Immutable, append-only record of every
// platform action (impersonate enter/exit, tenant status change, operator
// grant/revoke). Backed by platform_audit_log (trigger-enforced immutable).
import { IconHistory, IconRefresh } from '@tabler/icons-vue'
import { listPlatformAudit } from '@/api/platform.js'

const rows = ref([])
const loading = ref(false)

// Human labels for the action verbs recorded server-side.
const ACTION_LABELS = {
  COMPANY_SET_STATUS: 'Tenant status changed',
  PLATFORM_ADMIN_GRANT: 'Operator granted',
  PLATFORM_ADMIN_UPDATE: 'Operator role changed',
  PLATFORM_ADMIN_REVOKE: 'Operator revoked',
  IMPERSONATE_START: 'Impersonation started',
  IMPERSONATE_END: 'Impersonation ended',
}

const columns = [
  { name: 'occurredAt', label: 'WHEN', field: 'occurredAt', align: 'left', sortable: true },
  { name: 'action', label: 'ACTION', field: 'action', align: 'left', sortable: true },
  { name: 'actor', label: 'OPERATOR', field: 'actor', align: 'left' },
  { name: 'target', label: 'TARGET', field: 'target', align: 'left' },
  { name: 'detail', label: 'DETAIL', field: 'detail', align: 'left' },
  { name: 'ipAddress', label: 'IP', field: 'ipAddress', align: 'left' },
]
const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([{ id: 'occurredAt', desc: true }])

async function load() {
  loading.value = true
  try {
    const data = await listPlatformAudit(200)
    rows.value = (data?.logs || []).map((l) => ({
      id: l.id,
      occurredAt: l.occurredAt,
      action: ACTION_LABELS[l.action] || l.action,
      actor: l.actor
        ? `${l.actor.firstName || ''} ${l.actor.lastName || ''}`.trim() || l.actorEmail
        : l.actorEmail || '—',
      target: l.company ? `${l.company.name} (${l.company.code})` : l.targetUserId ? 'User' : '—',
      detail: l.detail ? JSON.stringify(l.detail) : '—',
      ipAddress: l.ipAddress || '—',
    }))
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <BasePage width="wide">
    <PageHeader :icon="IconHistory" title="Platform Audit">
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
    >
      <template #body-cell-occurredAt="{ row }">
        <span class="tw:text-sm tw:text-on-main">{{ row.occurredAt?.formatDate('datetime') }}</span>
      </template>
      <template #body-cell-action="{ row }">
        <span class="tw:font-medium tw:text-on-main">{{ row.action }}</span>
      </template>
      <template #body-cell-actor="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ row.actor }}</span>
      </template>
      <template #body-cell-target="{ row }">
        <span class="tw:text-sm tw:text-secondary">{{ row.target }}</span>
      </template>
      <template #body-cell-detail="{ row }">
        <span class="tw:line-clamp-1 tw:max-w-xs tw:text-xs tw:text-secondary tw:font-mono">
          {{ row.detail }}
        </span>
      </template>
      <template #body-cell-ipAddress="{ row }">
        <span class="tw:text-xs tw:text-secondary tw:font-mono">{{ row.ipAddress }}</span>
      </template>
    </DataTable>
  </BasePage>
</template>
