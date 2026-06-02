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

const changeRequestMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value
        .filter((i) => i.entityType === 'ChangeRequest')
        .map((i) => i.entityId),
  ],
  async (db, [crIds]) => {
    const ids = [...new Set(crIds.filter(Boolean))]
    if (!ids.length) return {}
    const crs = await Promise.all(ids.map((id) => db.ChangeRequest.findByPk(id)))
    return Object.fromEntries(crs.filter(Boolean).map((c) => [c.id, c]))
  },
  { initial: {} },
)

// Approval tasks for a versioned AuditStandard — entityType
// 'AuditStandardVersion', entityId is the version row. Title is
// the parent standard's name; subtitle is the version label
// (v1.0, v2.0, etc.). Same resolve-via-parent pattern the
// AuditInstance map below uses.
const auditStandardVersionMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value
        .filter((i) => i.entityType === 'AuditStandardVersion')
        .map((i) => i.entityId),
  ],
  async (db, [versionIds]) => {
    const ids = [...new Set(versionIds.filter(Boolean))]
    if (!ids.length) return {}
    const versions = await Promise.all(ids.map((id) => db.AuditStandardVersion.findByPk(id)))
    const standardIds = [
      ...new Set(versions.filter(Boolean).map((v) => v.auditStandardId).filter(Boolean)),
    ]
    const standards = await Promise.all(standardIds.map((id) => db.AuditStandard.findByPk(id)))
    const standardById = Object.fromEntries(standards.filter(Boolean).map((s) => [s.id, s]))
    const map = {}
    for (const v of versions.filter(Boolean)) {
      map[v.id] = { version: v, standard: standardById[v.auditStandardId] ?? null }
    }
    return map
  },
  { initial: {} },
)

// Close-out review tasks for an AuditInstance — entityType
// 'AuditInstance', entityId is the instance row. Title comes from
// audit_number, subtitle is auditStandard's name when we can resolve it.
const auditInstanceMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value
        .filter((i) => i.entityType === 'AuditInstance')
        .map((i) => i.entityId),
  ],
  async (db, [auditIds]) => {
    const ids = [...new Set(auditIds.filter(Boolean))]
    if (!ids.length) return {}
    const audits = await Promise.all(ids.map((id) => db.AuditInstance.findByPk(id)))
    const standardIds = [
      ...new Set(audits.filter(Boolean).map((a) => a.auditStandardId).filter(Boolean)),
    ]
    const standards = await Promise.all(standardIds.map((id) => db.AuditStandard.findByPk(id)))
    const standardById = Object.fromEntries(standards.filter(Boolean).map((s) => [s.id, s]))
    const map = {}
    for (const a of audits.filter(Boolean)) {
      map[a.id] = { audit: a, standard: standardById[a.auditStandardId] ?? null }
    }
    return map
  },
  { initial: {} },
)

const logBookVersionMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value
        .filter((i) => i.entityType === 'LogBookVersion')
        .map((i) => i.entityId),
  ],
  async (db, [versionIds]) => {
    const ids = [...new Set(versionIds.filter(Boolean))]
    if (!ids.length) return {}
    const versions = await Promise.all(ids.map((id) => db.LogBookVersion.findByPk(id)))
    const out = {}
    for (const v of versions.filter(Boolean)) {
      const logBook = v.logBookId ? await db.LogBook.findByPk(v.logBookId) : null
      // "Type" = the log book's category (Daily / Calibration / …), or
      // its classification as a fallback. Mirrors how the column shows a
      // document/NC/CAPA type.
      let typeLabel = null
      if (logBook?.logBookTypeId) {
        const lbType = await db.LogBookType.findByPk(logBook.logBookTypeId)
        typeLabel = lbType?.name ?? logBook.logBookTypeId
      }
      if (!typeLabel && logBook) {
        typeLabel =
          logBook.recordClassification === 'CONTROLLED_RECORD'
            ? 'Controlled Record'
            : 'Operational Log'
      }
      out[v.id] = { version: v, logBook, typeLabel }
    }
    return out
  },
  { initial: {} },
)

// Scheduled inspections / log collections (My Queue → unified inbox).
// Resolve the instance → plan → log book for label / type / fill route.
const assignmentInstanceMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value
        .filter((i) => i.entityType === 'AssignmentInstance')
        .map((i) => i.entityId),
  ],
  async (db, [instanceIds]) => {
    const ids = [...new Set(instanceIds.filter(Boolean))]
    if (!ids.length) return {}
    const instances = await Promise.all(ids.map((id) => db.AssignmentInstance.findByPk(id)))
    const out = {}
    for (const inst of instances.filter(Boolean)) {
      const plan = inst.formAssignmentId
        ? await db.FormAssignment.findByPk(inst.formAssignmentId)
        : null
      const logBook = plan?.logBookId ? await db.LogBook.findByPk(plan.logBookId) : null
      let typeLabel = null
      if (logBook?.logBookTypeId) {
        const lbType = await db.LogBookType.findByPk(logBook.logBookTypeId)
        typeLabel = lbType?.name ?? logBook.logBookTypeId
      }
      out[inst.id] = { instance: inst, logBook, typeLabel }
    }
    return out
  },
  { initial: {} },
)

// Flagged log entries (entityType 'FieldRecord') — resolve the record →
// log book for label / type / open-the-entry route.
const fieldRecordMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value.filter((i) => i.entityType === 'FieldRecord').map((i) => i.entityId),
  ],
  async (db, [recordIds]) => {
    const ids = [...new Set(recordIds.filter(Boolean))]
    if (!ids.length) return {}
    const records = await Promise.all(ids.map((id) => db.FieldRecord.findByPk(id)))
    const out = {}
    for (const rec of records.filter(Boolean)) {
      const logBook = rec.logBookId ? await db.LogBook.findByPk(rec.logBookId) : null
      let typeLabel = null
      if (logBook?.logBookTypeId) {
        const lbType = await db.LogBookType.findByPk(logBook.logBookTypeId)
        typeLabel = lbType?.name ?? logBook.logBookTypeId
      }
      out[rec.id] = { record: rec, logBook, typeLabel }
    }
    return out
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
    if (instance.entityType === 'ChangeRequest') {
      const cr = changeRequestMap.value[instance.entityId]
      if (!cr) return false
      return cr.title?.toLowerCase().includes(q) || cr.crNumber?.toLowerCase().includes(q)
    }
    if (instance.entityType === 'LogBookVersion') {
      const lb = logBookVersionMap.value[instance.entityId]?.logBook
      return !!lb && (lb.title?.toLowerCase().includes(q) || lb.code?.toLowerCase().includes(q))
    }
    if (instance.entityType === 'AssignmentInstance') {
      const lb = assignmentInstanceMap.value[instance.entityId]?.logBook
      return !!lb && (lb.title?.toLowerCase().includes(q) || lb.code?.toLowerCase().includes(q))
    }
    if (instance.entityType === 'FieldRecord') {
      const entry = fieldRecordMap.value[instance.entityId]
      const lb = entry?.logBook
      return (
        lb?.title?.toLowerCase().includes(q) ||
        entry?.record?.recordNumber?.toLowerCase().includes(q)
      )
    }
    if (instance.entityType === 'AuditInstance') {
      const ai = auditInstanceMap.value[instance.entityId]
      return (
        ai?.audit?.auditNumber?.toLowerCase().includes(q) ||
        ai?.standard?.name?.toLowerCase().includes(q) ||
        ai?.standard?.code?.toLowerCase().includes(q)
      )
    }
    if (instance.entityType === 'AuditStandardVersion') {
      const sv = auditStandardVersionMap.value[instance.entityId]
      return (
        sv?.standard?.name?.toLowerCase().includes(q) ||
        sv?.standard?.code?.toLowerCase().includes(q)
      )
    }
    const doc = documentMap.value[instance.entityId]?.doc
    if (!doc) return false
    return doc.title?.toLowerCase().includes(q) || doc.docNumber?.toLowerCase().includes(q)
  })
})

// The desktop BaseTable sorts internally (newest first); the mobile card
// list iterates the rows directly, so sort here too — newest created
// first, matching the table's default.
const sortedInstances = computed(() =>
  [...filteredInstances.value].sort(
    (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
  ),
)

const EntityType = {
  DocumentVersion: 'Document',
  Nonconformance: 'Nonconformance',
  ChangeRequest: 'Change Request',
  TrainingAssignee: 'Training',
  TrainingInstance: 'Training Verification',
  Capa: 'CAPA',
  LogBookVersion: 'Log Book',
  AssignmentInstance: 'Inspection / Log',
  FieldRecord: 'Flagged Log',
  AuditInstance: 'Audit',
  AuditStandardVersion: 'Audit Standard',
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

function getChangeRequest(instance) {
  return changeRequestMap.value[instance.entityId] || null
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
  if (row.entityType === 'ChangeRequest') {
    return getCompanyPath(`change-requests/${row.entityId}`)
  }
  if (row.entityType === 'DocumentVersion') {
    const doc = documentMap.value[row.entityId]?.doc
    return doc ? getCompanyPath(`documents/${doc.id}`) : null
  }
  if (row.entityType === 'LogBookVersion') {
    const logBookId = logBookVersionMap.value[row.entityId]?.logBook?.id
    return logBookId ? getCompanyPath(`inspections-logs/log-books/${logBookId}`) : null
  }
  if (row.entityType === 'AssignmentInstance') {
    // Open the dedicated fill page for this scheduled inspection / log —
    // it has the log book + instance, so it opens straight into the form
    // and submitting completes the task.
    const logBookId = assignmentInstanceMap.value[row.entityId]?.logBook?.id
    return logBookId
      ? getCompanyPath(
          `inspections-logs/fill?logBookId=${logBookId}&assignmentInstanceId=${row.entityId}`,
        )
      : null
  }
  if (row.entityType === 'FieldRecord') {
    // Flagged log entry → open the records list with this entry's
    // preview panel auto-opened.
    return getCompanyPath(`inspections-logs/records?recordId=${row.entityId}`)
  }
  if (row.entityType === 'AuditInstance') {
    return getCompanyPath(`audits/instances/${row.entityId}`)
  }
  if (row.entityType === 'AuditStandardVersion') {
    // Deep-link to the parent standard's detail page (where reviewers
    // see the version timeline + clause list). Falls back to nothing
    // if the parent hasn't synced yet — the next bootstrap tick fixes
    // it.
    const standardId = auditStandardVersionMap.value[row.entityId]?.standard?.id
    return standardId ? getCompanyPath(`audits/standards/${standardId}`) : null
  }
  return null
}

// Compact title / subtitle for the mobile card view (the desktop table
// renders richer per-type cells; cards just need a line + an id/number).
function rowTitle(row) {
  switch (row.entityType) {
    case 'TrainingAssignee':
      return getTrainingAssigneeEntry(row)?.instance?.snapshot?.title || '—'
    case 'TrainingInstance':
      return trainingInstanceMap.value[row.entityId]?.snapshot?.title || '—'
    case 'Nonconformance':
      return getNc(row)?.title || '—'
    case 'Capa':
      return getCapa(row)?.title || '—'
    case 'ChangeRequest':
      return getChangeRequest(row)?.title || '—'
    case 'LogBookVersion':
      return logBookVersionMap.value[row.entityId]?.logBook?.title || 'Log book'
    case 'AssignmentInstance':
      return assignmentInstanceMap.value[row.entityId]?.logBook?.title || 'Scheduled inspection'
    case 'FieldRecord':
      return fieldRecordMap.value[row.entityId]?.logBook?.title || 'Flagged log entry'
    case 'AuditInstance':
      // Standard name is the most useful at-a-glance label; audit_number
      // is the formal identifier and lives in the subtitle below.
      return auditInstanceMap.value[row.entityId]?.standard?.name || 'Audit'
    case 'AuditStandardVersion':
      return auditStandardVersionMap.value[row.entityId]?.standard?.name || 'Audit Standard'
    default:
      return getDocument(row)?.title || '—'
  }
}
function rowSubtitle(row) {
  switch (row.entityType) {
    case 'Nonconformance':
      return getNc(row)?.ncNumber || ''
    case 'Capa':
      return getCapa(row)?.capaNumber || ''
    case 'ChangeRequest':
      return getChangeRequest(row)?.crNumber || ''
    case 'LogBookVersion':
      return logBookVersionMap.value[row.entityId]?.logBook?.code || ''
    case 'AssignmentInstance':
      return assignmentInstanceMap.value[row.entityId]?.logBook?.code || ''
    case 'FieldRecord':
      return fieldRecordMap.value[row.entityId]?.record?.recordNumber || ''
    case 'DocumentVersion':
      return getDocument(row)?.docNumber || ''
    case 'AuditInstance':
      return auditInstanceMap.value[row.entityId]?.audit?.auditNumber || ''
    case 'AuditStandardVersion': {
      const v = auditStandardVersionMap.value[row.entityId]?.version
      return v ? `v${v.versionMajor}.${v.versionMinor}` : ''
    }
    default:
      return ''
  }
}
</script>

<template>
  <div class="tw:contents">
  <!-- Mobile / portrait-tablet: card list. Tap behaves like the table
       row (navigate via entityRoute, or open the RFI dialog). -->
  <div class="tw:md:hidden tw:flex tw:flex-col tw:gap-2">
    <component
      :is="entityRoute(row) ? 'RouterLink' : 'div'"
      v-for="row in sortedInstances"
      :key="row.id"
      :to="entityRoute(row) || undefined"
      class="tw:block tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-3 tw:active:bg-main-hover tw:transition"
      :class="row.sourceType === 'InformationRequest' ? 'tw:cursor-pointer' : ''"
      @click="onRfiTaskClick(row)"
    >
      <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
        <div class="tw:min-w-0 tw:flex-1">
          <div class="tw:font-medium tw:text-on-main tw:truncate">{{ rowTitle(row) }}</div>
          <div class="tw:text-[11px] tw:text-secondary tw:truncate tw:mt-0.5">
            {{ EntityType[row.entityType] || row.entityType
            }}<span v-if="rowSubtitle(row)"> · {{ rowSubtitle(row) }}</span>
          </div>
        </div>
        <TrainingAssigneeStatusBadgeById
          v-if="row.entityType === 'TrainingAssignee' && getTrainingAssigneeEntry(row)?.assignee"
          :statusId="getTrainingAssigneeEntry(row).assignee.status"
        />
        <TaskInstanceStatusBadgeById v-else :statusId="row.statusId" :module="row.entityType" />
      </div>
      <div class="tw:mt-2 tw:text-[11px]">
        <span v-if="row.completedAt" class="tw:text-green-600 tw:font-medium">
          Completed {{ row.completedAt.formatDate('date') }}
        </span>
        <span
          v-else-if="row.dueDate"
          :class="isDuePast(row.dueDate) ? 'tw:text-red-500 tw:font-medium' : 'tw:text-secondary'"
        >
          Due {{ row.dueDate.formatDate('date') }}
        </span>
      </div>
    </component>
    <div
      v-if="!filteredInstances.length"
      class="tw:py-12 tw:text-center tw:text-sm tw:text-secondary"
    >
      No tasks.
    </div>
  </div>

  <!-- Desktop / landscape: full table -->
  <div class="tw:hidden tw:md:block">
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
        <template v-else-if="row.entityType === 'ChangeRequest'">
          <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
            {{ getChangeRequest(row)?.title || '—' }}
          </span>
          <span class="tw:text-[10px] tw:text-secondary tw:font-mono tw:tracking-tight">
            {{ getChangeRequest(row)?.crNumber || '—' }}
          </span>
        </template>
        <template v-else-if="row.entityType === 'LogBookVersion'">
          <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
            {{ logBookVersionMap[row.entityId]?.logBook?.title || 'Log book' }}
          </span>
          <span class="tw:text-[10px] tw:text-secondary tw:font-mono tw:tracking-tight">
            {{ logBookVersionMap[row.entityId]?.logBook?.code || '—' }} · v{{
              logBookVersionMap[row.entityId]?.version?.versionMajor ?? '?'
            }}.{{ logBookVersionMap[row.entityId]?.version?.versionMinor ?? 0 }}
          </span>
        </template>
        <template v-else-if="row.entityType === 'AssignmentInstance'">
          <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
            {{ assignmentInstanceMap[row.entityId]?.logBook?.title || 'Scheduled inspection' }}
          </span>
          <span class="tw:text-[10px] tw:text-secondary tw:font-mono tw:tracking-tight">
            {{ assignmentInstanceMap[row.entityId]?.logBook?.code || 'Scheduled log / inspection' }}
          </span>
        </template>
        <template v-else-if="row.entityType === 'FieldRecord'">
          <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
            {{ fieldRecordMap[row.entityId]?.logBook?.title || 'Flagged log entry' }}
          </span>
          <span class="tw:text-[10px] tw:text-secondary tw:font-mono tw:tracking-tight">
            {{ fieldRecordMap[row.entityId]?.record?.recordNumber || 'Needs your attention' }}
          </span>
        </template>
        <template v-else-if="row.entityType === 'AuditInstance'">
          <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
            {{ auditInstanceMap[row.entityId]?.standard?.name || 'Audit' }}
          </span>
          <span class="tw:text-[10px] tw:text-secondary tw:font-mono tw:tracking-tight">
            {{ auditInstanceMap[row.entityId]?.audit?.auditNumber || '—' }}
          </span>
        </template>
        <template v-else-if="row.entityType === 'AuditStandardVersion'">
          <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
            {{ auditStandardVersionMap[row.entityId]?.standard?.name || 'Audit Standard' }}
          </span>
          <span class="tw:text-[10px] tw:text-secondary tw:font-mono tw:tracking-tight">
            {{
              auditStandardVersionMap[row.entityId]?.version
                ? `v${auditStandardVersionMap[row.entityId].version.versionMajor}.${auditStandardVersionMap[row.entityId].version.versionMinor}`
                : '—'
            }}
          </span>
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
      <span
        v-else-if="row.entityType === 'LogBookVersion' && logBookVersionMap[row.entityId]?.typeLabel"
        class="tw:text-sm tw:text-on-main"
      >
        {{ logBookVersionMap[row.entityId].typeLabel }}
      </span>
      <span
        v-else-if="row.entityType === 'AssignmentInstance' && assignmentInstanceMap[row.entityId]?.typeLabel"
        class="tw:text-sm tw:text-on-main"
      >
        {{ assignmentInstanceMap[row.entityId].typeLabel }}
      </span>
      <span
        v-else-if="row.entityType === 'FieldRecord' && fieldRecordMap[row.entityId]?.typeLabel"
        class="tw:text-sm tw:text-on-main"
      >
        {{ fieldRecordMap[row.entityId].typeLabel }}
      </span>
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
  </div>

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
