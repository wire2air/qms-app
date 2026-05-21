<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import { currentSession } from '@/utils/currentSession'
import { DateTime } from 'luxon'

const props = defineProps({
  search: { type: String, default: '' },
  statusId: { type: String, default: null },
  taskKindId: { type: String, default: null },
})

const taskInstances = useLiveQueryWithDeps(
  [() => props.statusId, () => props.taskKindId, () => currentSession.value?.userId],
  async (db, [statusId, taskKindId, userId]) => {
    if (!userId) return []
    let results = await db.TaskInstance.where('assignedTo', userId).exec()
    if (statusId) results = results.filter((t) => t.statusId === statusId)
    if (taskKindId) results = results.filter((t) => t.taskKindId === taskKindId)
    return results
  },
  { initial: [] },
)

const documentMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value.filter((i) => i.entityType === 'DocumentVersion').map((i) => i.entityId),
  ],
  async (db, [entityIds]) => {
    const versionIds = [...new Set(entityIds.filter(Boolean))]
    if (!versionIds.length) return {}
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
      map[v.id] = { doc: docById[v.documentId], version: v }
    }
    return map
  },
  { initial: {} },
)

const ncMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value.filter((i) => i.entityType === 'Nonconformance').map((i) => i.entityId),
  ],
  async (db, [ncIds]) => {
    const ids = [...new Set(ncIds.filter(Boolean))]
    if (!ids.length) return {}
    const ncs = await Promise.all(ids.map((id) => db.Nonconformance.findByPk(id)))
    return Object.fromEntries(ncs.filter(Boolean).map((nc) => [nc.id, nc]))
  },
  { initial: {} },
)

const trainingAssigneeMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value.filter((i) => i.entityType === 'TrainingAssignee').map((i) => i.entityId),
  ],
  async (db, [assigneeIds]) => {
    const ids = [...new Set(assigneeIds.filter(Boolean))]
    if (!ids.length) return {}
    const assignees = await Promise.all(ids.map((id) => db.TrainingAssignee.findByPk(id)))
    const instanceIds = [...new Set(assignees.filter(Boolean).map((a) => a.trainingInstanceId).filter(Boolean))]
    const instances = await Promise.all(instanceIds.map((id) => db.TrainingInstance.findByPk(id)))
    const instanceById = Object.fromEntries(instances.filter(Boolean).map((i) => [i.id, i]))
    const map = {}
    for (const a of assignees.filter(Boolean)) {
      map[a.id] = { assignee: a, instance: instanceById[a.trainingInstanceId] }
    }
    return map
  },
  { initial: {} },
)

// For TRAINING_VERIFICATION tasks, entityId is the TrainingInstance itself
const trainingInstanceMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value.filter((i) => i.entityType === 'TrainingInstance').map((i) => i.entityId),
  ],
  async (db, [instanceIds]) => {
    const ids = [...new Set(instanceIds.filter(Boolean))]
    if (!ids.length) return {}
    const instances = await Promise.all(ids.map((id) => db.TrainingInstance.findByPk(id)))
    return Object.fromEntries(instances.filter(Boolean).map((i) => [i.id, i]))
  },
  { initial: {} },
)

const capaMap = useLiveQueryWithDeps(
  [() => taskInstances.value.filter((i) => i.entityType === 'Capa').map((i) => i.entityId)],
  async (db, [capaIds]) => {
    const ids = [...new Set(capaIds.filter(Boolean))]
    if (!ids.length) return {}
    const capas = await Promise.all(ids.map((id) => db.Capa.findByPk(id)))
    return Object.fromEntries(capas.filter(Boolean).map((c) => [c.id, c]))
  },
  { initial: {} },
)

const filteredInstances = computed(() => {
  if (!props.search) return taskInstances.value
  const q = props.search.toLowerCase()
  return taskInstances.value.filter((instance) => {
    if (instance.entityType === 'TrainingAssignee') {
      const title = trainingAssigneeMap.value[instance.entityId]?.instance?.snapshot?.title
      return title?.toLowerCase().includes(q)
    }
    if (instance.entityType === 'TrainingInstance') {
      const title = trainingInstanceMap.value[instance.entityId]?.snapshot?.title
      return title?.toLowerCase().includes(q)
    }
    if (instance.entityType === 'Nonconformance') {
      const nc = ncMap.value[instance.entityId]
      if (!nc) return false
      return nc.title?.toLowerCase().includes(q) || nc.ncNumber?.toLowerCase().includes(q)
    }
    if (instance.entityType === 'Capa') {
      const capa = capaMap.value[instance.entityId]
      if (!capa) return false
      return capa.title?.toLowerCase().includes(q) || capa.capaNumber?.toLowerCase().includes(q)
    }
    const doc = documentMap.value[instance.entityId]?.doc
    if (!doc) return false
    return doc.title?.toLowerCase().includes(q) || doc.docNumber?.toLowerCase().includes(q)
  })
})

const EntityType = {
  DocumentVersion: 'Document',
  Nonconformance: 'Nonconformance',
  TrainingAssignee: 'Training',
  TrainingInstance: 'Training Verification',
  Capa: 'CAPA',
}

const columns = [
  { name: 'title', label: 'ITEM', field: 'title', align: 'left' },
  {
    name: 'entityType',
    label: 'ENTITY TYPE',
    field: (row) => EntityType[row.entityType] || row.entityType,
    align: 'left',
  },
  { name: 'type', label: 'TYPE', field: 'type', align: 'left' },
  { name: 'dueDate', label: 'DUE DATE', field: 'dueDate', align: 'left', sortable: true },
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

function getTrainingAssigneeEntry(instance) {
  return trainingAssigneeMap.value[instance.entityId] || null
}

function getDocument(instance) {
  return documentMap.value[instance.entityId]?.doc || null
}

function getVersion(instance) {
  return documentMap.value[instance.entityId]?.version || null
}

function getNc(instance) {
  return ncMap.value[instance.entityId] || null
}

function getCapa(instance) {
  return capaMap.value[instance.entityId] || null
}

function isDuePast(dueDate) {
  if (!dueDate) return false
  return dueDate < DateTime.now()
}

// ── RFI dialog (handled inline; no navigation to the host entity) ────────────
// Active RFI tasks render as a clickable div (entityRoute returns null);
// clicking opens the dialog in the right mode based on the user's role
// and the RFI state. Completed RFI tasks are inert — clicking does nothing.
const showRfiDialog = ref(false)
const activeRfiId = ref(null)
const activeRfiMode = ref('view')
const activeRfiEntityType = ref(null)
const activeRfiEntityId = ref(null)

async function onRfiTaskClick(row) {
  if (row.sourceType !== 'InformationRequest') return
  // ANY RFI task is clickable — active to act, completed to re-read the
  // thread (question + response). Mode is derived from the RFI's current
  // state vs. the current user; respond/acknowledge are only offered to
  // the active party.
  const { db } = await import('@models/index')
  const rfi = await db.InformationRequest.findByPk(row.sourceId)
  if (!rfi) return
  activeRfiId.value = rfi.id
  activeRfiEntityType.value = rfi.entityType
  activeRfiEntityId.value = rfi.entityId
  if (rfi.statusId === 'OPEN' && rfi.recipientId === currentSession.value?.userId) {
    activeRfiMode.value = 'respond'
  } else if (
    rfi.statusId === 'RESPONDED' &&
    rfi.requesterId === currentSession.value?.userId
  ) {
    activeRfiMode.value = 'view' // shows Acknowledge button in this mode
  } else {
    activeRfiMode.value = 'view' // read-only thread
  }
  showRfiDialog.value = true
}

function entityRoute(row) {
  if (row.entityType === 'TrainingAssignee') {
    const instanceId = trainingAssigneeMap.value[row.entityId]?.instance?.id
    return instanceId ? getCompanyPath(`my-training/${instanceId}`) : null
  }
  if (row.entityType === 'TrainingInstance') {
    // Manager's verification task — open the verification dashboard scoped to this instance
    return getCompanyPath(`training-verifications/${row.entityId}`)
  }
  // RFI tasks: handled in-place via the dialog mounted at the bottom
  // of this table, no navigation. Returning null makes the row render
  // a plain <div> instead of a RouterLink — the click handler below
  // opens the dialog for active RFI tasks (no-op for completed ones).
  if (row.sourceType === 'InformationRequest') {
    return null
  }
  if (row.entityType === 'Nonconformance') {
    return getCompanyPath(`nonconformances/${row.entityId}`)
  }
  if (row.entityType === 'Capa') {
    return getCompanyPath(`capas/${row.entityId}`)
  }
  if (row.entityType === 'DocumentVersion') {
    const doc = documentMap.value[row.entityId]?.doc
    return doc ? getCompanyPath(`documents/${doc.id}`) : null
  }
  return null
}
</script>

<template>
  <div class="tw:contents">
  <BaseTable
    :pagination="pagination"
    :rows="filteredInstances"
    :columns="columns"
    rowKey="id"
  >
    <!-- Item Title -->
    <template #body-cell-title="{ row }">
      <component
        :is="entityRoute(row) ? 'RouterLink' : 'div'"
        class="tw:flex tw:flex-col tw:group"
        :class="row.sourceType === 'InformationRequest' ? 'tw:cursor-pointer' : ''"
        :to="entityRoute(row) || undefined"
        @click="onRfiTaskClick(row)"
      >
        <template v-if="row.entityType === 'TrainingAssignee'">
          <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
            {{ getTrainingAssigneeEntry(row)?.instance?.snapshot?.title || '—' }}
          </span>
        </template>
        <template v-else-if="row.entityType === 'TrainingInstance'">
          <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
            {{ trainingInstanceMap[row.entityId]?.snapshot?.title || '—' }}
          </span>
          <span class="tw:text-[10px] tw:text-secondary tw:font-mono tw:tracking-tight">
            Verification · {{ row.entityId.slice(0, 8) }}
          </span>
        </template>
        <template v-else-if="row.entityType === 'Nonconformance'">
          <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
            {{ getNc(row)?.title || '—' }}
          </span>
          <div class="tw:flex tw:items-center tw:gap-1.5">
            <span class="tw:text-[10px] tw:text-secondary tw:font-mono tw:tracking-tight">
              {{ getNc(row)?.ncNumber || '—' }}
            </span>
            <span
              v-if="row.sourceType === 'InformationRequest'"
              class="tw:text-[10px] tw:bg-blue-100 tw:text-blue-700 tw:px-1.5 tw:py-0.5 tw:rounded tw:font-medium"
            >
              Information request
            </span>
          </div>
        </template>
        <template v-else-if="row.entityType === 'Capa'">
          <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
            {{ getCapa(row)?.title || '—' }}
          </span>
          <div class="tw:flex tw:items-center tw:gap-1.5">
            <span class="tw:text-[10px] tw:text-secondary tw:font-mono tw:tracking-tight">
              {{ getCapa(row)?.capaNumber || '—' }}
            </span>
            <span
              v-if="row.sourceType === 'InformationRequest'"
              class="tw:text-[10px] tw:bg-blue-100 tw:text-blue-700 tw:px-1.5 tw:py-0.5 tw:rounded tw:font-medium"
            >
              Information request
            </span>
          </div>
        </template>
        <template v-else>
          <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
            {{ getDocument(row)?.title || '—' }}
          </span>
          <div class="tw:flex tw:items-center tw:gap-1.5">
            <span class="tw:text-[10px] tw:text-secondary tw:font-mono tw:tracking-tight">
              {{ getDocument(row)?.docNumber || '—' }}
            </span>
            <template v-if="getVersion(row)">
              <span class="tw:text-[10px] tw:text-secondary">·</span>
              <span class="tw:text-[10px] tw:text-primary tw:font-mono tw:tracking-tight">
                {{
                  getVersion(row).versionLabel
                    ? `v${getVersion(row).versionLabel}`
                    : `v${getVersion(row).versionMajor}.${getVersion(row).versionMinor}`
                }}
              </span>
            </template>
          </div>
        </template>
      </component>
    </template>

    <!-- Type -->
    <template #body-cell-type="{ row }">
      <span v-if="row.entityType === 'TrainingAssignee' || row.entityType === 'TrainingInstance'" class="tw:text-sm tw:text-secondary">—</span>
      <NcTypeBadgeById
        v-else-if="row.entityType === 'Nonconformance' && getNc(row)?.typeId"
        :typeId="getNc(row).typeId"
      />
      <CapaTypeBadgeById
        v-else-if="row.entityType === 'Capa' && getCapa(row)?.typeId"
        :typeId="getCapa(row).typeId"
      />
      <DocumentTypeBadgeById
        v-else-if="getDocument(row)?.documentTypeId"
        :documentTypeId="getDocument(row).documentTypeId"
        :iconOnly="false"
      />
      <span v-else class="tw:text-sm tw:text-secondary">—</span>
    </template>

    <!-- Due Date / Completed -->
    <template #body-cell-dueDate="{ row }">
      <span v-if="row.completedAt" class="tw:text-sm tw:font-medium tw:text-green-600">
        Completed {{ row.completedAt.formatDate('date') }}
      </span>
      <span
        v-else
        class="tw:text-sm tw:font-medium"
        :class="isDuePast(row.dueDate) ? 'tw:text-red-500' : 'tw:text-on-main'"
      >
        {{ row.dueDate ? row.dueDate.formatDate('date') : '—' }}
      </span>
    </template>

    <!-- Status -->
    <template #body-cell-status="{ row }">
      <TrainingAssigneeStatusBadgeById
        v-if="row.entityType === 'TrainingAssignee' && getTrainingAssigneeEntry(row)?.assignee"
        :statusId="getTrainingAssigneeEntry(row).assignee.status"
      />
      <TaskInstanceStatusBadgeById v-else :statusId="row.statusId" :module="row.entityType" />
    </template>

    <!-- Created -->
    <template #body-cell-createdAt="{ row }">
      <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
    </template>
  </BaseTable>

  <!-- RFI dialog — opens inline when an Information Request task row is
       clicked. Mounted once at the table level, parameterized per click. -->
  <InformationRequestDialog
    v-if="activeRfiEntityType && activeRfiEntityId"
    v-model="showRfiDialog"
    :mode="activeRfiMode"
    :entityType="activeRfiEntityType"
    :entityId="activeRfiEntityId"
    :rfiId="activeRfiId"
  />
  </div>
</template>
