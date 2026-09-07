<script setup>
import { getCompanyPath } from '@/utils/routeHelpers'
import { currentSession } from '@/utils/currentSession'
import { exportToCSV } from '@/utils/exportUtils.js'
import { matchesDateFilter } from '@/utils/dateRanges.js'
import { matchesDueWindow } from '@/utils/taskDueWindows.js'
import { DateTime } from 'luxon'

const props = defineProps({
  search: { type: String, default: '' },
  statusId: { type: String, default: null },
  taskKindId: { type: String, default: null },
  createdAt: { type: Object, default: null },
  // Due-in window ({ id, from?, to? }) — resolved against "now" per run, see
  // @/utils/taskDueWindows.
  dueWindow: { type: Object, default: null },
  // Whose tasks to list. null = the signed-in user (the original inbox); an
  // explicit list is the supervisor's team roster, already narrowed by the page
  // (taskInstancesHome owns who may appear in it).
  assigneeIds: { type: Array, default: null },
  // Team scope: name the assignee on every row and open on due date.
  showAssignee: { type: Boolean, default: false },
})

const resolvedAssigneeIds = computed(() => {
  if (props.assigneeIds) return props.assigneeIds
  const me = currentSession.value?.userId
  return me ? [me] : []
})

// Dep is the JOINED key, not the array: the roster arrives from a live query
// that hands back a fresh array on every User/Department sync tick, and an
// identity-compared dep would re-run this query — and the fifteen entity maps
// hanging off it — for a roster that did not actually change.
const assigneeKey = computed(() => resolvedAssigneeIds.value.join(','))

const taskInstances = useLiveQueryWithDeps(
  [
    () => props.statusId,
    () => props.taskKindId,
    () => props.createdAt,
    () => props.dueWindow,
    () => assigneeKey.value,
  ],
  async (db, [statusId, taskKindId, createdAt, dueWindow, key]) => {
    const assignees = key ? key.split(',') : []
    if (!assignees.length) return []
    // `assignedTo` is an index, so one keyed lookup per person stays cheaper
    // than a full scan even for a whole department.
    const perAssignee = await Promise.all(
      assignees.map((id) => db.TaskInstance.where('assignedTo', id).exec()),
    )
    let results = perAssignee.flat()
    if (statusId) results = results.filter((t) => t.statusId === statusId)
    if (taskKindId) results = results.filter((t) => t.taskKindId === taskKindId)
    if (createdAt) results = results.filter((t) => matchesDateFilter(t.createdAt, createdAt))
    if (dueWindow) results = results.filter((t) => matchesDueWindow(t.dueDate, dueWindow))
    return results
  },

  { models: ['TaskInstance'], initial: [] },
)

// Assignee display names for the team scope — needed as plain strings for the
// column's sort/filter/export value (the cell itself renders UserBadgeById).
// `force: true` keeps a deactivated user's name on their still-open tasks:
// "who do I reassign this from" is the whole point of the column.
const assigneeNameById = useLiveQueryWithDeps(
  [
    () =>
      props.showAssignee
        ? [...new Set(taskInstances.value.map((t) => t.assignedTo).filter(Boolean))]
            .sort()
            .join(',')
        : '',
  ],
  async (db, [key]) => {
    if (!key) return {}
    const users = await Promise.all(
      key.split(',').map((id) => db.User.findByPk(id, { force: true })),
    )
    return Object.fromEntries(
      users.filter(Boolean).map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email]),
    )
  },

  { models: ['User'], initial: {} },
)

function assigneeName(row) {
  return assigneeNameById.value[row.assignedTo] || ''
}

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

  { models: ['DocumentVersion', 'Document'], initial: {} },
)

// Collaborator tasks target the Document directly (entityType='Document',
// entityId=documentId) rather than a DocumentVersion, so resolve them by id.
const documentDirectMap = useLiveQueryWithDeps(
  [() => taskInstances.value.filter((i) => i.entityType === 'Document').map((i) => i.entityId)],
  async (db, [entityIds]) => {
    const ids = [...new Set(entityIds.filter(Boolean))]
    if (!ids.length) return {}
    const docs = await Promise.all(ids.map((id) => db.Document.findByPk(id)))
    return Object.fromEntries(docs.filter(Boolean).map((d) => [d.id, d]))
  },
  { models: ['Document'], initial: {} },
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

  { models: ['Nonconformance'], initial: {} },
)

const complaintMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value
        .filter((i) => i.entityType === 'CustomerComplaint')
        .map((i) => i.entityId),
  ],
  async (db, [complaintIds]) => {
    const ids = [...new Set(complaintIds.filter(Boolean))]
    if (!ids.length) return {}
    const complaints = await Promise.all(ids.map((id) => db.CustomerComplaint.findByPk(id)))
    return Object.fromEntries(complaints.filter(Boolean).map((c) => [c.id, c]))
  },

  { models: ['CustomerComplaint'], initial: {} },
)

const qmsComplaintMap = useLiveQueryWithDeps(
  [() => taskInstances.value.filter((i) => i.entityType === 'Complaint').map((i) => i.entityId)],
  async (db, [complaintIds]) => {
    const ids = [...new Set(complaintIds.filter(Boolean))]
    if (!ids.length) return {}
    const complaints = await Promise.all(ids.map((id) => db.Complaint.findByPk(id)))
    return Object.fromEntries(complaints.filter(Boolean).map((c) => [c.id, c]))
  },

  { models: ['Complaint'], initial: {} },
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
    const instanceIds = [
      ...new Set(
        assignees
          .filter(Boolean)
          .map((a) => a.trainingInstanceId)
          .filter(Boolean),
      ),
    ]
    const instances = await Promise.all(instanceIds.map((id) => db.TrainingInstance.findByPk(id)))
    const instanceById = Object.fromEntries(instances.filter(Boolean).map((i) => [i.id, i]))
    const map = {}
    for (const a of assignees.filter(Boolean)) {
      map[a.id] = { assignee: a, instance: instanceById[a.trainingInstanceId] }
    }
    return map
  },

  { models: ['TrainingAssignee', 'TrainingInstance'], initial: {} },
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

  { models: ['TrainingInstance'], initial: {} },
)

const capaMap = useLiveQueryWithDeps(
  [() => taskInstances.value.filter((i) => i.entityType === 'Capa').map((i) => i.entityId)],
  async (db, [capaIds]) => {
    const ids = [...new Set(capaIds.filter(Boolean))]
    if (!ids.length) return {}
    const capas = await Promise.all(ids.map((id) => db.Capa.findByPk(id)))
    return Object.fromEntries(capas.filter(Boolean).map((c) => [c.id, c]))
  },

  { models: ['Capa'], initial: {} },
)

const changeRequestMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value.filter((i) => i.entityType === 'ChangeRequest').map((i) => i.entityId),
  ],
  async (db, [crIds]) => {
    const ids = [...new Set(crIds.filter(Boolean))]
    if (!ids.length) return {}
    const crs = await Promise.all(ids.map((id) => db.ChangeRequest.findByPk(id)))
    return Object.fromEntries(crs.filter(Boolean).map((c) => [c.id, c]))
  },

  { models: ['ChangeRequest'], initial: {} },
)

const qualityEventMap = useLiveQueryWithDeps(
  [() => taskInstances.value.filter((i) => i.entityType === 'QualityEvent').map((i) => i.entityId)],
  async (db, [eventIds]) => {
    const ids = [...new Set(eventIds.filter(Boolean))]
    if (!ids.length) return {}
    const events = await Promise.all(ids.map((id) => db.QualityEvent.findByPk(id)))
    return Object.fromEntries(events.filter(Boolean).map((e) => [e.id, e]))
  },

  { models: ['QualityEvent'], initial: {} },
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
      ...new Set(
        versions
          .filter(Boolean)
          .map((v) => v.auditStandardId)
          .filter(Boolean),
      ),
    ]
    const standards = await Promise.all(standardIds.map((id) => db.AuditStandard.findByPk(id)))
    const standardById = Object.fromEntries(standards.filter(Boolean).map((s) => [s.id, s]))
    const map = {}
    for (const v of versions.filter(Boolean)) {
      map[v.id] = { version: v, standard: standardById[v.auditStandardId] ?? null }
    }
    return map
  },

  { models: ['AuditStandardVersion', 'AuditStandard'], initial: {} },
)

// Close-out review tasks for an AuditInstance — entityType
// 'AuditInstance', entityId is the instance row. Title comes from
// audit_number, subtitle is auditStandard's name when we can resolve it.
const auditInstanceMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value.filter((i) => i.entityType === 'AuditInstance').map((i) => i.entityId),
  ],
  async (db, [auditIds]) => {
    const ids = [...new Set(auditIds.filter(Boolean))]
    if (!ids.length) return {}
    const audits = await Promise.all(ids.map((id) => db.AuditInstance.findByPk(id)))
    const standardIds = [
      ...new Set(
        audits
          .filter(Boolean)
          .map((a) => a.auditStandardId)
          .filter(Boolean),
      ),
    ]
    const standards = await Promise.all(standardIds.map((id) => db.AuditStandard.findByPk(id)))
    const standardById = Object.fromEntries(standards.filter(Boolean).map((s) => [s.id, s]))
    const map = {}
    for (const a of audits.filter(Boolean)) {
      map[a.id] = { audit: a, standard: standardById[a.auditStandardId] ?? null }
    }
    return map
  },

  { models: ['AuditInstance', 'AuditStandard'], initial: {} },
)

const logBookMap = useLiveQueryWithDeps(
  [() => taskInstances.value],
  async (db, [tasks]) => {
    const out = {}
    if (!tasks?.length) return out
    const ids = [...new Set(tasks.filter((t) => t.entityType === 'LogBook').map((t) => t.entityId))]
    for (const id of ids) {
      const logBook = await db.LogBook.findByPk(id)
      if (!logBook) continue
      let typeLabel = null
      if (logBook.logBookTypeId) {
        const lbType = await db.LogBookType.findByPk(logBook.logBookTypeId)
        typeLabel = lbType?.name ?? logBook.logBookTypeId
      }
      out[id] = { logBook, typeLabel }
    }
    return out
  },
  { models: ['LogBook', 'LogBookType'], initial: {} },
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

  { models: ['AssignmentInstance', 'FormAssignment', 'LogBook', 'LogBookType'], initial: {} },
)

// QA Disposition tasks — entityId is the InspectionLot id.
const inspectionLotMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value.filter((i) => i.entityType === 'InspectionLot').map((i) => i.entityId),
  ],
  async (db, [lotIds]) => {
    const ids = [...new Set(lotIds.filter(Boolean))]
    if (!ids.length) return {}
    const lots = await Promise.all(ids.map((id) => db.InspectionLot.findByPk(id)))
    return Object.fromEntries(lots.filter(Boolean).map((l) => [l.id, l]))
  },

  { models: ['InspectionLot'], initial: {} },
)

// Retain-sample disposal-due tasks — entityId is the RetainSample id.
const retainSampleMap = useLiveQueryWithDeps(
  [() => taskInstances.value.filter((i) => i.entityType === 'RetainSample').map((i) => i.entityId)],
  async (db, [rsIds]) => {
    const ids = [...new Set(rsIds.filter(Boolean))]
    if (!ids.length) return {}
    const rows = await Promise.all(ids.map((id) => db.RetainSample.findByPk(id)))
    return Object.fromEntries(rows.filter(Boolean).map((r) => [r.id, r]))
  },

  { models: ['RetainSample'], initial: {} },
)

// Specification approval tasks — entityId is the Specification id.
const specificationMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value.filter((i) => i.entityType === 'Specification').map((i) => i.entityId),
  ],
  async (db, [specIds]) => {
    const ids = [...new Set(specIds.filter(Boolean))]
    if (!ids.length) return {}
    const specs = await Promise.all(ids.map((id) => db.Specification.findByPk(id)))
    return Object.fromEntries(specs.filter(Boolean).map((s) => [s.id, s]))
  },
  { models: ['Specification'], initial: {} },
)

// Flagged log entries (entityType 'FieldRecord') — resolve the record →
// log book for label / type / open-the-entry route.
const fieldRecordMap = useLiveQueryWithDeps(
  [() => taskInstances.value.filter((i) => i.entityType === 'FieldRecord').map((i) => i.entityId)],
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

  { models: ['FieldRecord', 'LogBook', 'LogBookType'], initial: {} },
)

// Admin-defined module tasks carry a dynamic entityType (the module's
// internalName / module_key), so they fall through every built-in branch.
// Anything NOT in this set is treated as a module record — resolved to its
// Record + template below.
const BUILTIN_ENTITY_TYPES = new Set([
  'DocumentVersion',
  'Document',
  'Nonconformance',
  'Capa',
  'CustomerComplaint',
  'Complaint',
  'ChangeRequest',
  'QualityEvent',
  'LogBook',
  'AssignmentInstance',
  'FieldRecord',
  'AuditInstance',
  'AuditStandardVersion',
  'InspectionLot',
  'RetainSample',
  'Specification',
  'LineClearanceChecklist',
  'TrainingAssignee',
  'TrainingInstance',
])

const moduleRecordMap = useLiveQueryWithDeps(
  [
    () =>
      taskInstances.value
        .filter((i) => !BUILTIN_ENTITY_TYPES.has(i.entityType))
        .map((i) => i.entityId),
  ],
  async (db, [entityIds]) => {
    const ids = [...new Set(entityIds.filter(Boolean))]
    if (!ids.length) return {}
    const records = await Promise.all(ids.map((id) => db.Record.findByPk(id)))
    const templateIds = [
      ...new Set(
        records
          .filter(Boolean)
          .map((r) => r.templateId)
          .filter(Boolean),
      ),
    ]
    const templates = await Promise.all(templateIds.map((id) => db.FormTemplate.findByPk(id)))
    const tplById = Object.fromEntries(templates.filter(Boolean).map((t) => [t.id, t]))
    const map = {}
    for (const r of records.filter(Boolean)) {
      map[r.id] = { record: r, template: tplById[r.templateId] || null }
    }
    return map
  },
  { models: ['Record', 'FormTemplate'], initial: {} },
)

// A task → its module Record entry (null for built-in entity types).
function moduleRecordFor(row) {
  return moduleRecordMap.value[row.entityId] || null
}
function moduleLabelFor(row) {
  const entry = moduleRecordFor(row)
  // Prefer the module's display name; fall back to its key (module_key) when the
  // template isn't synced (e.g. before RLS grants it), never a bare "Record".
  return (
    entry?.template?.moduleConfig?.displayName ||
    entry?.template?.title ||
    entry?.record?.moduleKey ||
    'Record'
  )
}

const filteredInstances = computed(() => {
  if (!props.search) return taskInstances.value
  const q = props.search.toLowerCase()
  return taskInstances.value.filter((instance) => {
    // Team scope: the assignee is a legitimate thing to search for ("what has
    // Priya got open"), and it is the one field the per-entity branches below
    // can never see.
    if (props.showAssignee && assigneeName(instance).toLowerCase().includes(q)) return true
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
    if (instance.entityType === 'CustomerComplaint') {
      const c = complaintMap.value[instance.entityId]
      if (!c) return false
      return c.subject?.toLowerCase().includes(q) || c.complaintNumber?.toLowerCase().includes(q)
    }
    if (instance.entityType === 'Complaint') {
      const c = qmsComplaintMap.value[instance.entityId]
      if (!c) return false
      return c.subject?.toLowerCase().includes(q) || c.complaintNumber?.toLowerCase().includes(q)
    }
    if (instance.entityType === 'ChangeRequest') {
      const cr = changeRequestMap.value[instance.entityId]
      if (!cr) return false
      return cr.title?.toLowerCase().includes(q) || cr.crNumber?.toLowerCase().includes(q)
    }
    if (instance.entityType === 'QualityEvent') {
      const ev = qualityEventMap.value[instance.entityId]
      if (!ev) return false
      return ev.title?.toLowerCase().includes(q) || ev.eventNumber?.toLowerCase().includes(q)
    }
    if (instance.entityType === 'LogBook') {
      const lb = logBookMap.value[instance.entityId]?.logBook
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
    if (instance.entityType === 'InspectionLot') {
      const lot = inspectionLotMap.value[instance.entityId]
      return !!lot && lot.lotNumber?.toLowerCase().includes(q)
    }
    if (instance.entityType === 'RetainSample') {
      const rs = retainSampleMap.value[instance.entityId]
      return (
        !!rs && (rs.rsNumber?.toLowerCase().includes(q) || rs.lotNumber?.toLowerCase().includes(q))
      )
    }
    if (instance.entityType === 'Specification') {
      const s = specificationMap.value[instance.entityId]
      return !!s && (s.name?.toLowerCase().includes(q) || s.code?.toLowerCase().includes(q))
    }
    if (instance.entityType === 'LineClearanceChecklist') {
      return 'line clearance checklist'.includes(q)
    }
    if (!BUILTIN_ENTITY_TYPES.has(instance.entityType)) {
      const entry = moduleRecordFor(instance)
      if (!entry) return false
      return (
        entry.record?.recordNumber?.toLowerCase().includes(q) ||
        entry.template?.title?.toLowerCase().includes(q)
      )
    }
    const doc = getDocument(instance)
    if (!doc) return false
    return doc.title?.toLowerCase().includes(q) || doc.docNumber?.toLowerCase().includes(q)
  })
})

// Default order per scope. The personal inbox stays newest-created-first (the
// order it has always had); the team scope opens on DUE DATE ascending, because
// a supervisor's list is read as a deadline queue — the point of the view is
// what lands next, not what was raised last.
const defaultSort = computed(() =>
  props.showAssignee ? [{ id: 'dueDate', desc: false }] : [{ id: 'createdAt', desc: true }],
)

const pagination = ref({ page: 1, pageSize: 50 })
const sort = ref([...defaultSort.value])

// Switching scope re-seats the sort on that scope's default. A sort the user
// chose for their own inbox is not the one they want on a deadline queue, and
// carrying it across reads as the tab having ignored the switch.
watch(defaultSort, (next) => {
  sort.value = [...next]
})

// The active sort's value for one row. Only the columns declared `sortable`
// need a case here — everything else falls through to null and leaves the rows
// in query order.
function sortValue(row, columnId) {
  if (columnId === 'assignee') return assigneeName(row) || null
  return row[columnId]?.toMillis?.() ?? null
}

// The desktop table sorts internally; the mobile card list and the CSV export
// iterate the rows directly, so mirror the active sort here rather than
// hardcoding one — an export that ignores the sort the user is looking at
// arrives as a different list from the one they asked for.
//
// Empty values sink to the bottom in EITHER direction: "no deadline" is not
// "the earliest deadline", and it must never head a due-date queue.
const sortedInstances = computed(() => {
  const active = sort.value[0] ?? defaultSort.value[0]
  const dir = active.desc ? -1 : 1
  return [...filteredInstances.value].sort((a, b) => {
    const av = sortValue(a, active.id)
    const bv = sortValue(b, active.id)
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1
    if (typeof av === 'string') return av.localeCompare(bv) * dir
    return (av - bv) * dir
  })
})

// Audit close-out tasks: TYPE column shows the audit's program (Internal /
// Supplier); standard-approval tasks show 'Standard Approval'.
const AUDIT_PROGRAM_LABEL = { INTERNAL: 'Internal Audit', SUPPLIER: 'Supplier Audit' }
function auditProgramLabel(id) {
  return AUDIT_PROGRAM_LABEL[id] || (id ? `${id} Audit` : 'Audit')
}

const EntityType = {
  DocumentVersion: 'Document',
  Document: 'Document',
  Nonconformance: 'Nonconformance',
  ChangeRequest: 'Change Request',
  QualityEvent: 'Quality Event',
  TrainingAssignee: 'Training',
  TrainingInstance: 'Training Verification',
  Capa: 'CAPA',
  CustomerComplaint: 'Support Complaint',
  Complaint: 'Complaint',
  LogBook: 'Log Book',
  AssignmentInstance: 'Inspection / Log',
  FieldRecord: 'Flagged Log',
  AuditInstance: 'Audit',
  AuditStandardVersion: 'Audit Standard',
  InspectionLot: 'QC Inspection Lot',
  RetainSample: 'Retain Sample',
  Specification: 'Specification',
  LineClearanceChecklist: 'Line Clearance',
}

const columns = computed(() => {
  // Only columns backed by a real scalar on the row can be filtered. `title`,
  // `type` and `status` are resolved per-entity-type through the maps above
  // (no plain row field), so a generic text/select filter on them would match
  // nothing — disable it. `entityType` filters on its friendly label (the same
  // value its accessor returns); dueDate/createdAt are luxon dates.
  const filterCfg = {
    title: { filterType: false },
    entityType: {
      filterType: 'select',
      filterOptions: Object.values(EntityType).map((label) => ({ value: label, label })),
    },
    type: { filterType: false },
    dueDate: { filterType: 'date' },
    status: { filterType: false },
    createdAt: { filterType: 'date' },
  }
  return [
    { name: 'title', label: 'ITEM', field: 'title', align: 'left' },
    // Team scope only — in the personal inbox every row has the same assignee.
    // The `field` is the resolved NAME (not the id) so the column sorts,
    // filters and exports as the reader sees it.
    ...(props.showAssignee
      ? [
          {
            name: 'assignee',
            label: 'ASSIGNEE',
            field: (row) => assigneeName(row),
            align: 'left',
            sortable: true,
            filterType: 'text',
          },
        ]
      : []),
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
  ].map((c) => ({ ...c, ...(filterCfg[c.name] || {}) }))
})

// Resolve a row's display title from the per-entity maps (mirrors the title
// cell), for export.
function titleFor(row) {
  switch (row.entityType) {
    case 'TrainingAssignee':
      return getTrainingAssigneeEntry(row)?.instance?.snapshot?.title || ''
    case 'TrainingInstance':
      return trainingInstanceMap.value[row.entityId]?.snapshot?.title || ''
    case 'Nonconformance':
      return getNc(row)?.title || ''
    case 'Capa':
      return getCapa(row)?.title || ''
    case 'CustomerComplaint':
      return getComplaint(row)?.subject || ''
    case 'Complaint':
      return getQmsComplaint(row)?.subject || ''
    case 'ChangeRequest':
      return getChangeRequest(row)?.title || ''
    case 'QualityEvent':
      return getQualityEvent(row)?.title || ''
    case 'LogBook':
      return logBookMap.value[row.entityId]?.logBook?.title || ''
    case 'AssignmentInstance':
      return assignmentInstanceMap.value[row.entityId]?.logBook?.title || ''
    case 'FieldRecord':
      return fieldRecordMap.value[row.entityId]?.logBook?.title || ''
    case 'AuditInstance':
      return (
        auditInstanceMap.value[row.entityId]?.standard?.name ||
        auditInstanceMap.value[row.entityId]?.audit?.auditNumber ||
        ''
      )
    case 'AuditStandardVersion':
      return auditStandardVersionMap.value[row.entityId]?.standard?.name || ''
    case 'InspectionLot':
      return inspectionLotMap.value[row.entityId]?.lotNumber || ''
    case 'RetainSample':
      return retainSampleMap.value[row.entityId]?.rsNumber || ''
    case 'Specification':
      return specificationMap.value[row.entityId]?.name || ''
    case 'LineClearanceChecklist':
      return 'Line Clearance Checklist'
    default: {
      const entry = moduleRecordFor(row)
      if (entry) return entry.record?.recordNumber || moduleLabelFor(row)
      return getDocument(row)?.title || ''
    }
  }
}

function exportCsv() {
  exportToCSV(
    sortedInstances.value,
    [
      { field: (r) => titleFor(r), label: 'Item' },
      // Mirrors the visible columns: an Assignee column in the export would be
      // a single repeated name in the personal inbox.
      ...(props.showAssignee ? [{ field: (r) => assigneeName(r), label: 'Assignee' }] : []),
      { field: (r) => EntityType[r.entityType] || r.entityType, label: 'Entity Type' },
      { field: 'statusId', label: 'Status' },
      { field: (r) => r.dueDate?.toFormat?.('yyyy-LL-dd') ?? '', label: 'Due' },
      { field: (r) => r.createdAt?.toFormat?.('yyyy-LL-dd') ?? '', label: 'Created' },
    ],
    props.showAssignee ? 'team-tasks' : 'my-tasks',
  )
}

function getTrainingAssigneeEntry(instance) {
  return trainingAssigneeMap.value[instance.entityId] || null
}

function getDocument(instance) {
  if (instance.entityType === 'Document') return documentDirectMap.value[instance.entityId] || null
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

function getComplaint(instance) {
  return complaintMap.value[instance.entityId] || null
}

function getQmsComplaint(instance) {
  return qmsComplaintMap.value[instance.entityId] || null
}

function getChangeRequest(instance) {
  return changeRequestMap.value[instance.entityId] || null
}

function getQualityEvent(instance) {
  return qualityEventMap.value[instance.entityId] || null
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
  } else if (rfi.statusId === 'RESPONDED' && rfi.requesterId === currentSession.value?.userId) {
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
  if (row.entityType === 'CustomerComplaint') {
    return getCompanyPath(`customer-complaints/${row.entityId}`)
  }
  if (row.entityType === 'Complaint') {
    return getCompanyPath(`complaints/${row.entityId}`)
  }
  if (row.entityType === 'ChangeRequest') {
    return getCompanyPath(`change-requests/${row.entityId}`)
  }
  if (row.entityType === 'QualityEvent') {
    return getCompanyPath(`qualityEvents/${row.entityId}`)
  }
  if (row.entityType === 'DocumentVersion') {
    const doc = documentMap.value[row.entityId]?.doc
    return doc ? getCompanyPath(`documents/${doc.id}`) : null
  }
  if (row.entityType === 'Document') {
    return getCompanyPath(`documents/${row.entityId}`)
  }
  if (row.entityType === 'LogBook') {
    const logBookId = logBookMap.value[row.entityId]?.logBook?.id
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
  if (row.entityType === 'InspectionLot') {
    return getCompanyPath(`qc-inspection/lots/${row.entityId}`)
  }
  if (row.entityType === 'RetainSample') {
    return getCompanyPath(`qc-inspection/retain-samples/${row.entityId}`)
  }
  if (row.entityType === 'Specification') {
    return getCompanyPath(`qc-inspection/specifications/${row.entityId}`)
  }
  if (row.entityType === 'LineClearanceChecklist') {
    return getCompanyPath('qc-inspection?tab=line-clearance')
  }
  const moduleEntry = moduleRecordFor(row)
  if (moduleEntry?.record?.moduleKey) {
    return getCompanyPath(`m/${moduleEntry.record.moduleKey}/${row.entityId}`)
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
    case 'CustomerComplaint':
      return getComplaint(row)?.subject || '—'
    case 'Complaint':
      return getQmsComplaint(row)?.subject || '—'
    case 'ChangeRequest':
      return getChangeRequest(row)?.title || '—'
    case 'QualityEvent':
      return getQualityEvent(row)?.title || '—'
    case 'LogBook':
      return logBookMap.value[row.entityId]?.logBook?.title || 'Log book'
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
    case 'InspectionLot':
      return inspectionLotMap.value[row.entityId]?.lotNumber || 'Inspection Lot'
    case 'RetainSample':
      return retainSampleMap.value[row.entityId]?.rsNumber || 'Retain Sample'
    case 'Specification':
      return specificationMap.value[row.entityId]?.name || 'Specification'
    case 'LineClearanceChecklist':
      return 'Line Clearance Checklist'
    default: {
      const entry = moduleRecordFor(row)
      if (entry) return moduleLabelFor(row)
      return getDocument(row)?.title || '—'
    }
  }
}
function rowSubtitle(row) {
  switch (row.entityType) {
    case 'Nonconformance':
      return getNc(row)?.ncNumber || ''
    case 'Capa':
      return getCapa(row)?.capaNumber || ''
    case 'CustomerComplaint':
      return getComplaint(row)?.complaintNumber || ''
    case 'Complaint':
      return getQmsComplaint(row)?.complaintNumber || ''
    case 'ChangeRequest':
      return getChangeRequest(row)?.crNumber || ''
    case 'QualityEvent':
      return getQualityEvent(row)?.eventNumber || ''
    case 'LogBook':
      return logBookMap.value[row.entityId]?.logBook?.code || ''
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
    case 'InspectionLot': {
      const lot = inspectionLotMap.value[row.entityId]
      return lot?.inspectionPoint || ''
    }
    case 'RetainSample': {
      const rs = retainSampleMap.value[row.entityId]
      return rs?.lotNumber ? `Lot ${rs.lotNumber}` : ''
    }
    case 'Specification':
      return specificationMap.value[row.entityId]?.code || ''
    default:
      return moduleRecordFor(row)?.record?.recordNumber || ''
  }
}

defineExpose({ exportCsv })
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
            <div class="tw:text-caption tw:text-secondary tw:truncate tw:mt-0.5">
              {{ EntityType[row.entityType] || row.entityType
              }}<span v-if="rowSubtitle(row)"> · {{ rowSubtitle(row) }}</span>
            </div>
            <!-- Whose task it is — the card's equivalent of the ASSIGNEE column. -->
            <div v-if="showAssignee" class="tw:mt-1">
              <UserBadgeById v-if="row.assignedTo" :userId="row.assignedTo" />
            </div>
          </div>
          <TrainingAssigneeStatusBadgeById
            v-if="row.entityType === 'TrainingAssignee' && getTrainingAssigneeEntry(row)?.assignee"
            :statusId="getTrainingAssigneeEntry(row).assignee.status"
          />
          <TaskInstanceStatusBadgeById
            v-else
            :statusId="row.statusId"
            :task="row"
            :module="row.entityType"
          />
        </div>
        <div class="tw:mt-2 tw:text-caption">
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
      <DataTable
        v-model:pagination="pagination"
        v-model:sort="sort"
        :rows="filteredInstances"
        :columns="columns"
        rowKey="id"
        :mobileCards="false"
        filterable
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
              <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                Verification · {{ row.entityId.slice(0, 8) }}
              </span>
            </template>
            <template v-else-if="row.entityType === 'Nonconformance'">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ getNc(row)?.title || '—' }}
              </span>
              <div class="tw:flex tw:items-center tw:gap-1.5">
                <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                  {{ getNc(row)?.ncNumber || '—' }}
                </span>
                <span
                  v-if="row.sourceType === 'InformationRequest'"
                  class="tw:text-micro tw:bg-blue-100 tw:text-blue-700 tw:px-1.5 tw:py-0.5 tw:rounded tw:font-medium"
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
                <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                  {{ getCapa(row)?.capaNumber || '—' }}
                </span>
                <span
                  v-if="row.sourceType === 'InformationRequest'"
                  class="tw:text-micro tw:bg-blue-100 tw:text-blue-700 tw:px-1.5 tw:py-0.5 tw:rounded tw:font-medium"
                >
                  Information request
                </span>
              </div>
            </template>
            <template v-else-if="row.entityType === 'CustomerComplaint'">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ getComplaint(row)?.subject || '—' }}
              </span>
              <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                {{ getComplaint(row)?.complaintNumber || '—' }}
              </span>
            </template>
            <template v-else-if="row.entityType === 'Complaint'">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ getQmsComplaint(row)?.subject || '—' }}
              </span>
              <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                {{ getQmsComplaint(row)?.complaintNumber || '—' }}
              </span>
            </template>
            <template v-else-if="row.entityType === 'ChangeRequest'">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ getChangeRequest(row)?.title || '—' }}
              </span>
              <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                {{ getChangeRequest(row)?.crNumber || '—' }}
              </span>
            </template>
            <template v-else-if="row.entityType === 'QualityEvent'">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ getQualityEvent(row)?.title || '—' }}
              </span>
              <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                {{ getQualityEvent(row)?.eventNumber || '—' }}
              </span>
            </template>
            <template v-else-if="row.entityType === 'LogBook'">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ logBookMap[row.entityId]?.logBook?.title || 'Log book' }}
              </span>
              <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                {{ logBookMap[row.entityId]?.logBook?.code || '—' }} · V{{
                  logBookMap[row.entityId]?.logBook?.generation ?? 1
                }}
              </span>
            </template>
            <template v-else-if="row.entityType === 'AssignmentInstance'">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ assignmentInstanceMap[row.entityId]?.logBook?.title || 'Scheduled inspection' }}
              </span>
              <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                {{
                  assignmentInstanceMap[row.entityId]?.logBook?.code || 'Scheduled log / inspection'
                }}
              </span>
            </template>
            <template v-else-if="row.entityType === 'FieldRecord'">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ fieldRecordMap[row.entityId]?.logBook?.title || 'Flagged log entry' }}
              </span>
              <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                {{ fieldRecordMap[row.entityId]?.record?.recordNumber || 'Needs your attention' }}
              </span>
            </template>
            <template v-else-if="row.entityType === 'AuditInstance'">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ auditInstanceMap[row.entityId]?.standard?.name || 'Audit' }}
              </span>
              <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                {{ auditInstanceMap[row.entityId]?.audit?.auditNumber || '—' }}
              </span>
            </template>
            <template v-else-if="row.entityType === 'AuditStandardVersion'">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ auditStandardVersionMap[row.entityId]?.standard?.name || 'Audit Standard' }}
              </span>
              <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                {{
                  auditStandardVersionMap[row.entityId]?.version
                    ? `v${auditStandardVersionMap[row.entityId].version.versionMajor}.${auditStandardVersionMap[row.entityId].version.versionMinor}`
                    : '—'
                }}
              </span>
            </template>
            <template v-else-if="row.entityType === 'InspectionLot'">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ inspectionLotMap[row.entityId]?.lotNumber || 'Inspection Lot' }}
              </span>
              <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                {{ inspectionLotMap[row.entityId]?.inspectionPoint || '—' }}
              </span>
            </template>
            <template v-else-if="row.entityType === 'RetainSample'">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ retainSampleMap[row.entityId]?.rsNumber || 'Retain Sample' }}
              </span>
              <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                {{
                  retainSampleMap[row.entityId]?.lotNumber
                    ? `Lot ${retainSampleMap[row.entityId].lotNumber}`
                    : '—'
                }}
              </span>
            </template>
            <template v-else-if="row.entityType === 'Specification'">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ specificationMap[row.entityId]?.name || 'Specification' }}
              </span>
              <span
                v-if="specificationMap[row.entityId]?.code"
                class="tw:text-micro tw:text-secondary tw:tracking-tight"
              >
                {{ specificationMap[row.entityId].code }}
              </span>
            </template>
            <template v-else-if="row.entityType === 'LineClearanceChecklist'">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                Line Clearance Checklist
              </span>
            </template>
            <template v-else-if="moduleRecordFor(row)">
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ moduleLabelFor(row) }}
              </span>
              <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                {{ moduleRecordFor(row)?.record?.recordNumber || '—' }}
              </span>
            </template>
            <template v-else>
              <span class="tw:text-sm tw:font-semibold tw:text-on-main tw:group-hover:text-primary">
                {{ getDocument(row)?.title || '—' }}
              </span>
              <div class="tw:flex tw:items-center tw:gap-1.5">
                <span class="tw:text-micro tw:text-secondary tw:tracking-tight">
                  {{ getDocument(row)?.docNumber || '—' }}
                </span>
                <template v-if="getVersion(row)">
                  <span class="tw:text-micro tw:text-secondary">·</span>
                  <span class="tw:text-micro tw:text-primary tw:tracking-tight">
                    {{
                      getVersion(row).versionLabel
                        ? `v${getVersion(row).versionLabel}`
                        : `v${getVersion(row).versionMajor}.${getVersion(row).versionMinor}`
                    }}
                  </span>
                </template>
              </div>
            </template>

            <!-- Task comment subline. Renders for ANY entity type when a
             task has a populated comment — typically the back-to-owner
             REVIEW task minted after all sub-tasks complete (handler
             onComplete), or an ACTION task with reviewer context.
             Gives the assignee a one-line "why" without having to open
             the detail page. -->
            <span
              v-if="row.comment"
              class="tw:text-caption tw:text-secondary tw:italic tw:mt-0.5 tw:line-clamp-2"
            >
              {{ row.comment }}
            </span>
          </component>
        </template>

        <!-- Assignee (team scope only — the column isn't declared otherwise) -->
        <template #body-cell-assignee="{ row }">
          <UserBadgeById v-if="row.assignedTo" :userId="row.assignedTo" />
          <span v-else class="tw:text-sm tw:text-secondary">—</span>
        </template>

        <!-- Type -->
        <template #body-cell-type="{ row }">
          <span
            v-if="row.entityType === 'TrainingAssignee' || row.entityType === 'TrainingInstance'"
            class="tw:text-sm tw:text-secondary"
            >—</span
          >
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
            v-else-if="row.entityType === 'LogBook' && logBookMap[row.entityId]?.typeLabel"
            class="tw:text-sm tw:text-on-main"
          >
            {{ logBookMap[row.entityId].typeLabel }}
          </span>
          <span
            v-else-if="
              row.entityType === 'AssignmentInstance' &&
              assignmentInstanceMap[row.entityId]?.typeLabel
            "
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
          <span v-else-if="row.entityType === 'AuditInstance'" class="tw:text-sm tw:text-on-main">
            {{ auditProgramLabel(auditInstanceMap[row.entityId]?.audit?.programTypeId) }}
          </span>
          <span
            v-else-if="row.entityType === 'AuditStandardVersion'"
            class="tw:text-sm tw:text-on-main"
          >
            Standard Approval
          </span>
          <span v-else-if="row.entityType === 'InspectionLot'" class="tw:text-sm tw:text-on-main">
            QA Disposition
          </span>
          <span v-else-if="row.entityType === 'Specification'" class="tw:text-sm tw:text-on-main">
            Spec Approval
          </span>
          <span
            v-else-if="row.entityType === 'LineClearanceChecklist'"
            class="tw:text-sm tw:text-on-main"
          >
            Checklist Approval
          </span>
          <span
            v-else-if="row.entityType === 'CustomerComplaint' || row.entityType === 'Complaint'"
            class="tw:text-sm tw:text-on-main"
          >
            Complaint Review
          </span>
          <span v-else-if="moduleRecordFor(row)" class="tw:text-sm tw:text-on-main">
            {{ moduleLabelFor(row) }}
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
          <TaskInstanceStatusBadgeById
            v-else
            :statusId="row.statusId"
            :task="row"
            :module="row.entityType"
          />
        </template>

        <!-- Created -->
        <template #body-cell-createdAt="{ row }">
          <span class="tw:text-sm tw:text-secondary">{{ row.createdAt?.formatDate('date') }}</span>
        </template>
      </DataTable>
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
