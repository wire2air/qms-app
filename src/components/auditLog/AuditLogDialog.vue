<script setup>
import { h, defineAsyncComponent } from 'vue'
import { IconShield, IconDownload, IconRefresh } from '@tabler/icons-vue'
import BaseSpinner from '@shared/components/BaseSpinner.vue'

const props = defineProps({
  // Single-entity mode: shows changes made TO this record.
  // entityType uses the table-derived PascalCase plural ('Documents', 'Users', etc.)
  entityType: { type: String, default: null },
  entityId: { type: String, default: null },
  // Multi-entity mode: include audit rows from several related entities at once.
  // Useful for parent + children (e.g. a Document plus its Versions, Sections, Links).
  // Shape: [{ entityType: 'Documents', entityIds: ['id1', 'id2', ...] }, ...]
  includeEntities: { type: Array, default: () => [] },
  // Actor-scoped mode: shows actions performed BY this user.
  // Useful on user detail pages to see "what did this user do".
  performedBy: { type: String, default: null },
  // Optional title — defaults to "Audit Log"
  title: { type: String, default: 'Audit Log' },
  // Optional limit; defaults to 500 — enough for most histories
  limit: { type: Number, default: 500 },
})

const model = defineModel({ type: Boolean, default: false })

// Lazy-load the audit list: its subtree (AuditLogsItem → AuditLogEntityLink →
// per-entity resolvers/badges) is a ~2.5 MB chunk. Async-loading it here means
// it loads only when the dialog is actually opened — keeping it off the
// critical path of the 8 entity detail pages that embed this dialog. A
// centered spinner covers the (one-time, then cached) chunk download; `delay`
// avoids flashing it when the chunk is already cached.
const AuditListLoading = () =>
  h('div', { class: 'tw:flex tw:justify-center tw:py-12' }, h(BaseSpinner, { size: 'md' }))
const AuditLogsList = defineAsyncComponent({
  loader: () => import('./AuditLogsList.vue'),
  loadingComponent: AuditListLoading,
  delay: 150,
})

const refreshKey = ref(0)

// Build a per-entityType id set so the in-memory filter is O(1) per log
const entityIdSetByType = computed(() => {
  const map = new Map()
  if (props.entityId && props.entityType) {
    map.set(props.entityType, new Set([props.entityId]))
  }
  for (const block of props.includeEntities ?? []) {
    if (!block?.entityType || !Array.isArray(block.entityIds)) continue
    const existing = map.get(block.entityType) ?? new Set()
    for (const id of block.entityIds) if (id) existing.add(id)
    map.set(block.entityType, existing)
  }
  return map
})

const logs = useLiveQueryWithDeps(
  [
    () => model.value,
    () => entityIdSetByType.value,
    () => props.performedBy,
    () => refreshKey.value,
  ],
  async (db, [open, byType, performedBy]) => {
    if (!open) return []
    const hasEntities = byType.size > 0
    if (!hasEntities && !performedBy) return []

    // Full scan + in-memory filter (matches the existing audit-page pattern).
    const all = await db.AuditLog.where().orderBy('createdAt', 'desc').limit(5000).exec()
    let filtered = all
    if (hasEntities) {
      filtered = filtered.filter((log) => byType.get(log.entityType)?.has(log.entityId))
    } else if (performedBy) {
      filtered = filtered.filter((log) => log.performedBy === performedBy)
    }
    return filtered.slice(0, props.limit)
  },
  { models: 'AuditLog', initial: [] },
)

const loading = computed(() => logs.value === undefined)

const totalIncludedEntities = computed(() => {
  let n = 0
  for (const set of entityIdSetByType.value.values()) n += set.size
  return n
})

function csvEscape(value) {
  if (value === null || value === undefined) return ''
  let s = typeof value === 'string' ? value : JSON.stringify(value)
  s = s.replaceAll('"', '""')
  if (/[",\n\r]/.test(s)) s = `"${s}"`
  return s
}

// Resolve performedBy IDs to display names for the CSV export
const performedByNames = useLiveQueryWithDeps(
  [() => (logs.value ?? []).map((l) => l.performedBy).join(',')],
  async (db) => {
    const ids = [...new Set((logs.value ?? []).map((l) => l.performedBy).filter(Boolean))]
    if (!ids.length) return {}
    const users = await Promise.all(ids.map((id) => db.User.findByPk(id)))
    const map = {}
    for (const u of users.filter(Boolean)) {
      map[u.id] = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id
    }
    return map
  },

  { models: ['User'], initial: {} },
)

function exportCsv() {
  const nameMap = performedByNames.value ?? {}
  const header = [
    'When',
    'Action',
    'Entity Type',
    'Entity ID',
    'Performed By',
    'User ID',
    'IP Address',
    'Old Value',
    'New Value',
  ]
  const rows = (logs.value ?? []).map((log) => [
    log.createdAt?.formatDate?.('datetime') ?? log.createdAt ?? '',
    log.action ?? '',
    log.entityType ?? '',
    log.entityId ?? '',
    nameMap[log.performedBy] ?? log.performedBy ?? '',
    log.performedBy ?? '',
    log.ipAddress ?? '',
    log.oldValueJson,
    log.newValueJson,
  ])
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-log-${props.entityType ?? 'export'}-${(props.entityId ?? '').slice(0, 8)}-${Date.now()}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <BaseDialog v-model="model" :title="title" maxWidth="3xl">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-3">
      <div class="tw:flex tw:items-center tw:justify-between">
        <p class="tw:text-xs tw:text-secondary">
          Tamper-evident record of changes. Showing {{ logs?.length ?? 0 }} entries
          <template v-if="totalIncludedEntities > 1">
            across {{ totalIncludedEntities }} related records
          </template>
          (most recent first).
        </p>
        <div class="tw:flex tw:items-center tw:gap-2">
          <BaseButton variant="outline" size="sm" @click="refreshKey++">
            <IconRefresh :size="14" class="tw:mr-1" /> Refresh
          </BaseButton>
          <BaseButton variant="outline" size="sm" :disabled="!logs?.length" @click="exportCsv">
            <IconDownload :size="14" class="tw:mr-1" /> Export CSV
          </BaseButton>
        </div>
      </div>

      <div v-if="loading" class="tw:flex tw:justify-center tw:py-12">
        <BaseSpinner size="md" />
      </div>

      <AuditLogsList v-else-if="logs?.length" :logs="logs" />

      <BaseEmptyState
        v-else
        :icon="IconShield"
        title="No audit entries"
        description="No changes have been recorded yet."
        dense
      />
    </div>
  </BaseDialog>
</template>
