<script setup>
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { IconFileDescription, IconPlus } from '@tabler/icons-vue'

const router = useRouter()

// Filters + resolved content state (URL-synced). Declared before the live query
// because `total`/`empty` are lazy getters that read `documents`.
const list = useListLayout({
  filters: {
    search: '',
    documentTypeId: null,
    documentTemplateId: null,
    departmentId: null,
    statusId: null,
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
  async (db, [documentTypeId, documentTemplateId, departmentId]) => {
    let q = db.Document.where()
    if (documentTypeId) q = q.where('documentTypeId', documentTypeId)
    if (documentTemplateId) q = q.where('documentTemplateId', documentTemplateId)
    if (departmentId) q = q.where('departmentId', departmentId)
    return q.exec()
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
  const statusId = list.filters.value.statusId
  if (statusId) {
    const currentStatuses = currentVersionStatusByDocId.value ?? {}
    const latestStatuses = latestVersionStatusByDocId.value ?? {}
    rows = rows.filter(
      (d) =>
        d.statusId === statusId ||
        currentStatuses[d.id] === statusId ||
        latestStatuses[d.id] === statusId,
    )
  }
  if (!list.filters.value.search) return rows
  const q = list.filters.value.search.toLowerCase()
  return rows.filter(
    (d) => d.title?.toLowerCase().includes(q) || d.docNumber?.toLowerCase().includes(q),
  )
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

const canCreate = computed(() => isAllowed(['documents:create']))

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
