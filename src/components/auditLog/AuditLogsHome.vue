<script setup>
import { IconShield } from '@tabler/icons-vue'
import { useAuditLogs } from '@/composables/useAuditLogs.js'

const { auditLogs, loading, filters } = useAuditLogs()

// Filter state + data live in the `useAuditLogs` provide/inject composable
// (shared with AuditLogsFilters), so `useListLayout` is used here only for the
// resolved content state. `total`/`loading`/`empty` are lazy getters reading
// the injected `auditLogs`/`loading`.
// syncUrl: false — `dateFrom`/`dateTo` are luxon DateTime values that don't
// round-trip through query strings.
const list = useListLayout({
  total: () => auditLogs.value?.length ?? 0,
  loading: () => loading.value,
  empty: () => !auditLogs.value?.length,
  syncUrl: false,
})

const hasActiveFilters = computed(
  () =>
    filters.value.modules.length > 0 ||
    filters.value.actions.length > 0 ||
    !!filters.value.performedBy ||
    !!filters.value.entityType ||
    !!filters.value.dateFrom ||
    !!filters.value.dateTo,
)
</script>

<template>
  <BaseListLayout
    helpSlug="KB/administration/audit-logs"
    title="Audit Logs"
    :icon="IconShield"
    subtitle="Tamper-evident record of all system actions."
    :state="list.state.value"
    :emptyIcon="IconShield"
    :emptyTitle="
      hasActiveFilters ? 'No audit log entries match your filters' : 'No audit log entries found'
    "
    emptyDescription="Audit logs will appear here as actions are performed."
  >
    <template #filters>
      <div class="tw:bg-sidebar tw:p-3 tw:rounded-xl">
        <AuditLogsFilters />
      </div>
    </template>

    <AuditLogsList :logs="auditLogs" />
  </BaseListLayout>
</template>
