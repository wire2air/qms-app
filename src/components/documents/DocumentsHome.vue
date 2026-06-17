<script setup>
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { IconFileDescription, IconPlus } from '@tabler/icons-vue'

const router = useRouter()

const filters = ref({
  search: '',
  documentTypeId: null,
  documentTemplateId: null,
  departmentId: null,
  statusId: null,
})

const allDocuments = useLiveQueryWithDeps(
  [
    () => filters.value.documentTypeId,
    () => filters.value.documentTemplateId,
    () => filters.value.departmentId,
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
  let list = allDocuments.value ?? []
  const statusId = filters.value.statusId
  if (statusId) {
    const currentStatuses = currentVersionStatusByDocId.value ?? {}
    const latestStatuses = latestVersionStatusByDocId.value ?? {}
    list = list.filter(
      (d) =>
        d.statusId === statusId ||
        currentStatuses[d.id] === statusId ||
        latestStatuses[d.id] === statusId,
    )
  }
  if (!filters.value.search) return list
  const q = filters.value.search.toLowerCase()
  return list.filter(
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
  <BasePage width="wide" density="compact">
    <PageHeader :icon="IconFileDescription" title="Documents" />

    <SafeTeleport to="#main-header-actions">
      <BaseButton v-if="canCreate" @click="navigateToCreate">
        <IconPlus :size="16" class="tw:mr-1" />
        Create Document
      </BaseButton>
    </SafeTeleport>

    <!-- Page Header -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:flex-col tw:gap-1">
        <div class="tw:text-3xl tw:font-bold tw:text-on-sidebar">Documents</div>
        <div class="tw:text-sm tw:text-secondary">
          Manage controlled documents, versions, and approvals.
        </div>
      </div>
    </div>

    <!-- Stats Cards -->
    <DocumentsStatsCards :stats="stats" :total="statsTotal" />

    <!-- Filter Toolbar -->
    <DocumentsFilterToolbar v-model:filters="filters" />

    <!-- Documents Table -->
    <DocumentsTable
      :rows="documents"
      :loading="allDocuments === undefined"
      @view="navigateToDetail"
    />
  </BasePage>
</template>
