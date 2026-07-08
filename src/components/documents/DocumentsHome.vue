<script setup>
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { IconFileDescription, IconPlus } from '@tabler/icons-vue'

const router = useRouter()

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty` are lazy getters that read `documents`.
const list = useListLayout({
  filters: {
    // Multi-select dimensions (Linear-style filter menu) — arrays of ids.
    // (Free-text search now lives in the table toolbar, not here.)
    documentTypeId: [],
    departmentId: [],
    statusId: [],
    // Deep-link only (e.g. from a template) — single value, no toolbar control.
    documentTemplateId: null,
  },
  total: () => documents.value.length,
  empty: () => documents.value.length === 0,
  loading: () => allDocuments.value === undefined,
  syncUrl: true,
})

const allDocuments = useLiveQueryWithDeps(
  [
    () => list.filters.value.documentTypeId,
    () => list.filters.value.documentTemplateId,
    () => list.filters.value.departmentId,
  ],
  async (db, [documentTypeIds, documentTemplateId, departmentIds]) => {
    let rows = await db.Document.where().exec()
    if (Array.isArray(documentTypeIds) && documentTypeIds.length)
      rows = rows.filter((d) => documentTypeIds.includes(d.documentTypeId))
    if (documentTemplateId) rows = rows.filter((d) => d.documentTemplateId === documentTemplateId)
    if (Array.isArray(departmentIds) && departmentIds.length)
      rows = rows.filter((d) => departmentIds.includes(d.departmentId))
    return rows
  },

  { models: ['Document'], initial: [] },
)

const currentVersionStatusByDocId = useLiveQueryWithDeps(
  [() => (allDocuments.value ?? []).map((d) => d.id)],
  async (db, [ids]) => {
    if (ids.length === 0) return {}
    const versions = await db.DocumentVersion.where(
      '[documentId+statusId]',
      ids.map((id) => [id, 'EFFECTIVE']),
    ).exec()
    const map = {}
    for (const v of versions) map[v.documentId] = v.statusId
    return map
  },

  { models: ['DocumentVersion'], initial: {} },
)

const latestVersionStatusByDocId = useLiveQueryWithDeps(
  [() => (allDocuments.value ?? []).map((d) => d.id)],
  async (db, [ids]) => {
    if (ids.length === 0) return {}
    const versions = await db.DocumentVersion.where('documentId', ids)
      .where('isLatest', true)
      .exec()
    const map = {}
    for (const v of versions) {
      const existing = map[v.documentId]
      if (!existing || v.createdAt > existing.createdAt) {
        map[v.documentId] = v
      }
    }
    const statusMap = {}
    for (const [docId, v] of Object.entries(map)) statusMap[docId] = v.statusId
    return statusMap
  },

  { models: ['DocumentVersion'], initial: {} },
)

const documents = computed(() => {
  let rows = allDocuments.value ?? []
  const statusIds = list.filters.value.statusId
  if (Array.isArray(statusIds) && statusIds.length) {
    const currentStatuses = currentVersionStatusByDocId.value ?? {}
    const latestStatuses = latestVersionStatusByDocId.value ?? {}
    rows = rows.filter(
      (d) =>
        statusIds.includes(d.statusId) ||
        statusIds.includes(currentStatuses[d.id]) ||
        statusIds.includes(latestStatuses[d.id]),
    )
  }
  return rows
})

const allDocumentsForStats = useLiveQuery(async (db) => db.Document.where().exec(), {
  models: ['Document'],
  initial: [],
})

const stats = computed(() => {
  const list = allDocumentsForStats.value ?? []
  const counts = {}
  for (const d of list) {
    counts[d.statusId] = (counts[d.statusId] || 0) + 1
  }
  return Object.entries(counts).map(([statusId, count]) => ({ statusId, count }))
})

const statsTotal = computed(() => (allDocumentsForStats.value ?? []).length)

// Create needs read too: the create mutation reads the new row back through the
// `documents:read` RLS SELECT policy, so create-without-read fails at the DB.
const canCreate = computed(() => isAllowed(['documents:create', 'documents:read']))

function navigateToCreate() {
  router.push(getCompanyPath('/documents/create'))
}

function navigateToDetail(row) {
  router.push(getCompanyPath(`/documents/${row.id}`))
}
</script>

<template>
  <BaseListLayout
    title="Documents"
    :icon="IconFileDescription"
    subtitle="Manage controlled documents, versions, and approvals."
    :state="list.state.value"
    :emptyIcon="IconFileDescription"
    :emptyTitle="list.hasActiveFilters.value ? 'No documents match your filters' : 'No documents yet'"
  >
    <template #title>
      <span class="tw:inline-flex tw:items-center tw:gap-1.5">
        Documents
        <HelpButton slug="KB/documents/document-control" :size="16" />
      </span>
    </template>

    <template #actions>
      <BaseButton v-if="canCreate" @click="navigateToCreate">
        <IconPlus :size="16" class="tw:mr-1" />
        Create Document
      </BaseButton>
    </template>

    <!-- Stats Cards -->
    <template #stats>
      <DocumentsStatsCards :stats="stats" :total="statsTotal" />
    </template>

    <!-- Filter Toolbar -->
    <template #filters>
      <DocumentsFilterToolbar v-model:filters="list.filters.value" />
    </template>

    <!-- Documents Table -->
    <DocumentsTable
      :rows="documents"
      :loading="allDocuments === undefined"
      @view="navigateToDetail"
    />
  </BaseListLayout>
</template>
