import { db } from '@models/index'
import { currentSession } from '@/utils/currentSession.js'

/**
 * Log book ↔ document-training compliance (2026-08-08), the frontend mirror
 * of backend/shared/utils/logBookTraining.js.
 *
 * A log book can link controlling documents. When a linked document carries
 * a training requirement, a user must be TRAINED on it before they can be
 * assigned the book (soft warning) or file entries (hard block, enforced by
 * the backend — this is only the UX).
 *
 * "Requires training" = an ACTIVE Training is bound to the document, via its
 *   auto-training (trainings.sourceDocumentId) or a training_document_links row.
 * "Trained" = a TrainingAssignee for the user (on any instance of a bound
 *   training) with status VERIFIED (manager-verified competency).
 *
 * All queries read the local syncEngine store; results reflect whatever the
 * current user can see. Missing visibility only ever produces a false
 * "untrained" — acceptable, since the assign warning is overridable and the
 * entry block is re-checked server-side with full access.
 */

const TRAINED_STATUSES = new Set(['VERIFIED'])

/**
 * Resolve, per user, the linked documents they still owe training on for a
 * log book.
 * @returns {Promise<{ requiredDocs: Array<{id,title}>, byUser: Map<string, Array<{id,title}>> }>}
 */
export async function resolveLogBookTrainingGaps(logBookId, userIds) {
  const users = [...new Set((userIds ?? []).filter(Boolean))]
  const empty = { requiredDocs: [], byUser: new Map(users.map((u) => [u, []])) }
  if (!logBookId || !users.length) return empty

  const links = await db.LogBookDocumentLink.where('logBookId', logBookId).exec()
  const docIds = [...new Set(links.map((l) => l.documentId).filter(Boolean))]
  if (!docIds.length) return empty

  // ACTIVE trainings bound to those docs (auto-training + library links).
  const allTrainings = await db.Training.where().exec()
  const activeById = new Map(
    allTrainings.filter((t) => t.status === 'ACTIVE').map((t) => [t.id, t]),
  )
  const docLinkRows = (await db.TrainingDocumentLink.where().exec()).filter((r) =>
    docIds.includes(r.documentId),
  )

  // trainingId -> Set(documentId)
  const trainingToDocs = new Map()
  const add = (trainingId, documentId) => {
    if (!trainingId || !documentId) return
    if (!trainingToDocs.has(trainingId)) trainingToDocs.set(trainingId, new Set())
    trainingToDocs.get(trainingId).add(documentId)
  }
  for (const t of activeById.values()) {
    if (t.sourceDocumentId && docIds.includes(t.sourceDocumentId)) add(t.id, t.sourceDocumentId)
  }
  for (const r of docLinkRows) if (activeById.has(r.trainingId)) add(r.trainingId, r.documentId)

  const trainingIds = [...trainingToDocs.keys()]
  if (!trainingIds.length) return empty

  const requiredDocIds = new Set()
  for (const docs of trainingToDocs.values()) for (const d of docs) requiredDocIds.add(d)

  // Instances of those trainings, then VERIFIED assignees for our users.
  const allInstances = await db.TrainingInstance.where().exec()
  const instances = allInstances.filter((i) => trainingToDocs.has(i.trainingId))
  const instanceToTraining = new Map(instances.map((i) => [i.id, i.trainingId]))
  const instanceIds = new Set(instances.map((i) => i.id))

  const assignees = (await db.TrainingAssignee.where().exec()).filter(
    (a) =>
      users.includes(a.userId) &&
      instanceIds.has(a.trainingInstanceId) &&
      TRAINED_STATUSES.has(a.status),
  )
  const trainedDocsByUser = new Map(users.map((u) => [u, new Set()]))
  for (const a of assignees) {
    const docs = trainingToDocs.get(instanceToTraining.get(a.trainingInstanceId))
    if (!docs) continue
    const set = trainedDocsByUser.get(a.userId)
    for (const d of docs) set.add(d)
  }

  const docRows = (await db.Document.where().exec()).filter((d) => requiredDocIds.has(d.id))
  const titleById = new Map(docRows.map((d) => [d.id, d.title]))
  const asDoc = (id) => ({ id, title: titleById.get(id) ?? id })

  const requiredDocs = [...requiredDocIds].map(asDoc)
  const byUser = new Map()
  for (const u of users) {
    const trained = trainedDocsByUser.get(u) ?? new Set()
    byUser.set(u, [...requiredDocIds].filter((d) => !trained.has(d)).map(asDoc))
  }
  return { requiredDocs, byUser }
}

/** Single-user gaps for a log book (empty array = cleared). */
export async function findUntrainedLinkedDocs(logBookId, userId) {
  const { byUser } = await resolveLogBookTrainingGaps(logBookId, [userId])
  return byUser.get(userId) ?? []
}

/**
 * Resolve the actual user ids an assignment targets: named users UNIONED with
 * the members of every assigned role (2026-08-15 — an assignment may carry
 * both). Used by the assign-time training warning, so it must see everyone who
 * will actually be asked to fill the book; returning early on named users
 * would skip the roles and under-report untrained people.
 *
 * Mirrors resolveAssignees() in the worker's assignment generator — the two
 * must agree on who the audience is, or the warning describes a different set
 * of people from the one that gets the task.
 */
export async function resolveAssignmentAudience({ assignedUserIds, assignedRoleIds }) {
  const out = new Set(Array.isArray(assignedUserIds) ? assignedUserIds.filter(Boolean) : [])

  const roleIds = Array.isArray(assignedRoleIds) ? assignedRoleIds.filter(Boolean) : []
  for (const roleId of roleIds) {
    const rows = await db.RoleOnUser.where('roleId', roleId).exec()
    for (const r of rows) if (r.userId) out.add(r.userId)
  }

  return [...out]
}

/**
 * Reactive Set<logBookId> of ACTIVE books the CURRENT user is blocked from
 * filling because a linked document requires training they lack. Also exposes
 * a per-book document-name lookup for the blocking message.
 *
 * Recomputes on changes to any input model (doc links, trainings, instances,
 * assignees) via useLiveQueryWithDeps.
 */
export function useUntrainedLogBookBlocks() {
  const userId = computed(() => currentSession.value?.userId ?? currentSession.value?.id ?? null)

  const state = useLiveQueryWithDeps(
    [() => userId.value],
    async (dbi, [uid]) => {
      const blocked = new Map() // logBookId -> [{id,title}]
      if (!uid) return blocked

      const links = await dbi.LogBookDocumentLink.where().exec()
      if (!links.length) return blocked
      const byBook = new Map()
      for (const l of links) {
        if (!l.documentId) continue
        if (!byBook.has(l.logBookId)) byBook.set(l.logBookId, new Set())
        byBook.get(l.logBookId).add(l.documentId)
      }

      const trainings = (await dbi.Training.where().exec()).filter((t) => t.status === 'ACTIVE')
      const activeIds = new Set(trainings.map((t) => t.id))
      const docLinks = await dbi.TrainingDocumentLink.where().exec()
      // documentId -> Set(trainingId) that requires it
      const docToTrainings = new Map()
      const addReq = (docId, trainingId) => {
        if (!docToTrainings.has(docId)) docToTrainings.set(docId, new Set())
        docToTrainings.get(docId).add(trainingId)
      }
      for (const t of trainings) if (t.sourceDocumentId) addReq(t.sourceDocumentId, t.id)
      for (const r of docLinks) if (activeIds.has(r.trainingId)) addReq(r.documentId, r.trainingId)

      const instances = await dbi.TrainingInstance.where().exec()
      const instanceToTraining = new Map(instances.map((i) => [i.id, i.trainingId]))
      const myAssignees = (await dbi.TrainingAssignee.where('userId', uid).exec()).filter((a) =>
        TRAINED_STATUSES.has(a.status),
      )
      const myVerifiedTrainings = new Set(
        myAssignees.map((a) => instanceToTraining.get(a.trainingInstanceId)).filter(Boolean),
      )

      const docs = await dbi.Document.where().exec()
      const titleById = new Map(docs.map((d) => [d.id, d.title]))

      for (const [logBookId, docIdSet] of byBook) {
        const missing = []
        for (const docId of docIdSet) {
          const reqTrainings = docToTrainings.get(docId)
          if (!reqTrainings || !reqTrainings.size) continue // no requirement
          const satisfied = [...reqTrainings].some((tid) => myVerifiedTrainings.has(tid))
          if (!satisfied) missing.push({ id: docId, title: titleById.get(docId) ?? docId })
        }
        if (missing.length) blocked.set(logBookId, missing)
      }
      return blocked
    },
    {
      models: [
        'LogBookDocumentLink',
        'Training',
        'TrainingDocumentLink',
        'TrainingInstance',
        'TrainingAssignee',
        'Document',
      ],
      initial: new Map(),
    },
  )

  const isBlocked = (logBookId) => state.value?.has(logBookId) ?? false
  const missingDocsFor = (logBookId) => state.value?.get(logBookId) ?? []
  return { blocked: state, isBlocked, missingDocsFor }
}
