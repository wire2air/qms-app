<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  search: { type: String, default: '' },
  statusId: { type: String, default: null },
  moduleId: { type: String, default: null },
})

const instances = useLiveQueryWithDeps(
  [() => props.statusId],
  async (db, [statusId]) => {
    let results = await db.WorkflowInstance.where().exec()
    if (statusId) results = results.filter((i) => i.statusId === statusId)
    return results
  },
  { initial: [] },
)

const documentMap = useLiveQueryWithDeps(
  [
    () =>
      instances.value.filter((i) => i.resourceType === 'DocumentVersion').map((i) => i.resourceId),
  ],
  async (db, [resourceIds]) => {
    const versionIds = [...new Set(resourceIds.filter(Boolean))]
    if (!versionIds.length) return {}
    // resourceId is a documentVersionId — resolve version then parent document
    const versions = await Promise.all(versionIds.map((id) => db.DocumentVersion.findByPk(id)))
    const documentIds = [
      ...new Set(
        versions
          .filter(Boolean)
          .map((v) => v.documentId)
          .filter(Boolean),
      ),
    ]
    const documents = await Promise.all(documentIds.map((id) => db.Document.findByPk(id)))
    const docById = Object.fromEntries(documents.filter(Boolean).map((d) => [d.id, d]))
    const map = {}
    for (const v of versions.filter(Boolean)) {
      map[v.id] = docById[v.documentId]
    }
    return map
  },
  { initial: {} },
)

const ncMap = useLiveQueryWithDeps(
  [
    () =>
      instances.value.filter((i) => i.resourceType === 'Nonconformance').map((i) => i.resourceId),
  ],
  async (db, [ncIds]) => {
    const ids = [...new Set(ncIds.filter(Boolean))]
    if (!ids.length) return {}
    const ncs = await Promise.all(ids.map((id) => db.Nonconformance.findByPk(id)))
    return Object.fromEntries(ncs.filter(Boolean).map((nc) => [nc.id, nc]))
  },
  { initial: {} },
)

const capaMap = useLiveQueryWithDeps(
  [() => instances.value.filter((i) => i.resourceType === 'Capa').map((i) => i.resourceId)],
  async (db, [capaIds]) => {
    const ids = [...new Set(capaIds.filter(Boolean))]
    if (!ids.length) return {}
    const capas = await Promise.all(ids.map((id) => db.Capa.findByPk(id)))
    return Object.fromEntries(capas.filter(Boolean).map((c) => [c.id, c]))
  },
  { initial: {} },
)

const moduleIdMap = useLiveQueryWithDeps(
  [() => instances.value.map((i) => i.workflowVersionId)],
  async (db, [wfVersionIds]) => {
    const ids = [...new Set(wfVersionIds.filter(Boolean))]
    if (!ids.length) return {}
    const wfVersions = await Promise.all(ids.map((id) => db.WorkflowVersion.findByPk(id)))
    const workflowIds = [
      ...new Set(
        wfVersions
          .filter(Boolean)
          .map((v) => v.workflowId)
          .filter(Boolean),
      ),
    ]
    const workflows = await Promise.all(workflowIds.map((id) => db.Workflow.findByPk(id)))
    const wfById = Object.fromEntries(workflows.filter(Boolean).map((w) => [w.id, w]))
    const map = {}
    for (const v of wfVersions.filter(Boolean)) {
      const wf = wfById[v.workflowId]
      if (wf) map[v.id] = wf.moduleId
    }
    return map
  },
  { initial: {} },
)

const activeStepNameMap = useLiveQueryWithDeps(
  [() => instances.value.map((i) => i.id)],
  async (db, [instanceIds]) => {
    if (!instanceIds.length) return {}
    const allSteps = await Promise.all(
      instanceIds.map((id) =>
        db.WorkflowInstanceStep.where('[workflowInstanceId+statusId]', [id, 'IN_PROGRESS']).exec(),
      ),
    )
    // `name` is denormalized onto the instance row — no WorkflowStep fetch needed.
    const map = {}
    for (let i = 0; i < instanceIds.length; i++) {
      const active = (allSteps[i] || [])[0]
      if (active) map[instanceIds[i]] = active.name || null
    }
    return map
  },
  { initial: {} },
)

const filteredInstances = computed(() => {
  let results = instances.value
  if (props.moduleId) {
    results = results.filter(
      (instance) => moduleIdMap.value[instance.workflowVersionId] === props.moduleId,
    )
  }
  if (!props.search) return results
  const q = props.search.toLowerCase()
  return results.filter((instance) => {
    if (instance.resourceType === 'Nonconformance') {
      const nc = ncMap.value[instance.resourceId]
      if (!nc) return false
      return nc.title?.toLowerCase().includes(q) || nc.ncNumber?.toLowerCase().includes(q)
    }
    if (instance.resourceType === 'Capa') {
      const capa = capaMap.value[instance.resourceId]
      if (!capa) return false
      return capa.title?.toLowerCase().includes(q) || capa.capaNumber?.toLowerCase().includes(q)
    }
    const doc = documentMap.value[instance.resourceId]
    if (!doc) return false
    return doc.title?.toLowerCase().includes(q) || doc.docNumber?.toLowerCase().includes(q)
  })
})

const columns = [
  { name: 'title', label: 'ITEM TITLE', field: 'title', align: 'left' },
  { name: 'module', label: 'MODULE', field: 'module', align: 'left' },
  { name: 'type', label: 'TYPE', field: 'type', align: 'left' },
  { name: 'submittedBy', label: 'SUBMITTED BY', field: 'submittedBy', align: 'left' },
  { name: 'currentStep', label: 'CURRENT STEP', field: 'currentStep', align: 'left' },
  { name: 'status', label: 'STATUS', field: 'status', align: 'left' },
  { name: 'createdAt', label: 'CREATED', field: 'createdAt', align: 'left', sortable: true },
]

const pagination = ref({
  page: 1,
  rowsPerPage: 50,
  sortBy: 'createdAt',
  descending: true,
  total: null,
})

function getDocument(instance) {
  return documentMap.value[instance.resourceId] || null
}

function getNc(instance) {
  return ncMap.value[instance.resourceId] || null
}

function getCapa(instance) {
  return capaMap.value[instance.resourceId] || null
}

function routeForInstance(instance) {
  if (instance.resourceType === 'Capa') return getCompanyPath(`capas/${instance.resourceId}`)
  if (instance.resourceType === 'Nonconformance') {
    return getCompanyPath(`nonconformances/${instance.resourceId}`)
  }
  return getCompanyPath(`workflow-instances/${instance.id}`)
}
</script>

<template>
  <BaseTable
    v-model:pagination="pagination"
    :rows="filteredInstances"
    :columns="columns"
    rowKey="id"
  >
    <!-- Item Title -->
    <template #body-cell-title="{ row }">
      <RouterLink class="tw:flex tw:flex-col tw:group" :to="routeForInstance(row)">
        <template v-if="row.resourceType === 'Nonconformance'">
          <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
            {{ getNc(row)?.title || '—' }}
          </span>
          <span class="tw:text-[10px] tw:text-secondary tw:font-mono tw:tracking-tight">
            {{ getNc(row)?.ncNumber || row.id.slice(0, 8) }}
          </span>
        </template>
        <template v-else-if="row.resourceType === 'Capa'">
          <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
            {{ getCapa(row)?.title || '—' }}
          </span>
          <span class="tw:text-[10px] tw:text-secondary tw:font-mono tw:tracking-tight">
            {{ getCapa(row)?.capaNumber || row.id.slice(0, 8) }}
          </span>
        </template>
        <template v-else>
          <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
            {{ getDocument(row)?.title || '—' }}
          </span>
          <span class="tw:text-[10px] tw:text-secondary tw:font-mono tw:tracking-tight">
            {{ getDocument(row)?.docNumber || row.id.slice(0, 8) }}
          </span>
        </template>
      </RouterLink>
    </template>

    <!-- Module -->
    <template #body-cell-module="{ row }">
      <ModuleBadgeById
        v-if="moduleIdMap[row.workflowVersionId]"
        :moduleId="moduleIdMap[row.workflowVersionId]"
      />
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </template>

    <!-- Type -->
    <template #body-cell-type="{ row }">
      <CapaTypeBadgeById
        v-if="row.resourceType === 'Capa' && getCapa(row)?.typeId"
        :typeId="getCapa(row).typeId"
      />
      <DocumentTypeBadgeById
        v-else-if="getDocument(row)?.documentTypeId"
        :documentTypeId="getDocument(row).documentTypeId"
        :iconOnly="false"
      />
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </template>

    <!-- Submitted By -->
    <template #body-cell-submittedBy="{ row }">
      <UserBadgeById v-if="row.submittedBy" :userId="row.submittedBy" />
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </template>

    <!-- Current Step -->
    <template #body-cell-currentStep="{ row }">
      <span class="tw:text-sm tw:text-secondary">
        {{ activeStepNameMap[row.id] || '—' }}
      </span>
    </template>

    <!-- Status -->
    <template #body-cell-status="{ row }">
      <WorkflowInstanceStatusBadgeById :statusId="row.statusId" showDot />
    </template>

    <!-- Created -->
    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>
  </BaseTable>
</template>
