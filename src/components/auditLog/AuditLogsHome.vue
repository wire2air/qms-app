<script setup>
import { IconShield } from '@tabler/icons-vue'
import { useAuditLogs } from '@/composables/useAuditLogs.js'

const { auditLogs, loading } = useAuditLogs()
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconShield"
      title="Audit Logs"
      subtitle="Tamper-evident record of all system actions."
    />

    <div class="tw:bg-sidebar tw:p-3 tw:rounded-xl">
      <AuditLogsFilters />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="tw:flex tw:justify-center tw:py-16">
      <BaseSpinner size="lg" />
    </div>

    <!-- Logs list -->
    <AuditLogsList v-else-if="auditLogs?.length" :logs="auditLogs" />

    <!-- Empty state -->
    <BaseEmptyState
      v-else
      :icon="IconShield"
      title="No audit log entries found"
      description="Audit logs will appear here as actions are performed."
      dense
    />
  </BasePage>
</template>
