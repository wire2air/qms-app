/**
 * Acting on a step that is not assigned to you.
 *
 * Five components independently asked the same question — "is there a task on
 * this step assigned to ME?" — and hid every control when the answer was no.
 * That made the assignee the only person who could act, so a step whose
 * assignee was on leave stranded the record until someone reassigned it.
 *
 * The rule (2026-08-19): an assignment is ROUTING. The assignee is the
 * accountable party; anyone the permission matrix covers may act, and the audit
 * trail records who actually did. The server enforces this in
 * utils/workflowStepAccess.js; this is the UI half.
 *
 * ── Why a takeover must LOOK different ──────────────────────────────────────
 * The failure mode we are designing against is not unauthorized access, it is
 * ACCIDENTAL access: someone opens a record, sees the same green Approve button
 * they always see, clicks it, and the intended approver is left wondering why
 * their task was completed by someone else. So a task belonging to someone else
 * never renders as an ordinary action — the label names the assignee
 * ("Approve on behalf of Sam Patel"), which cannot be actioned without reading
 * whose it is. The assignee is notified server-side when it happens.
 */
import { isAllowedOnRecord } from '@/utils/currentSession.js'

/** Task states a user can still act on. */
export const ACTIONABLE_TASK_STATUSES = ['ASSIGNED', 'FORM_SUBMITTED']

/**
 * Which permission does acting on this step require?
 *
 * Mirrors actionForStepType in the backend's utils/workflowStepAccess.js.
 * APPROVAL is a distinct attestation and needs its own verb — if plain edit
 * rights let you approve, nobody would ever need `<module>:approve`.
 */
export function permissionForStep(authzModule, stepType) {
  if (!authzModule) return null
  return `${authzModule}:${stepType === 'APPROVAL' ? 'approve' : 'update'}`
}

/**
 * Pick the task this user may act on, and say whether doing so is a takeover.
 *
 * Their own task always wins: when you are the assignee this is your ordinary
 * work and must not be dressed up as acting for someone else. Only when you
 * have none does an actionable task belonging to somebody else come into play,
 * and only if the matrix covers it.
 *
 * @param {object}   args
 * @param {object[]} args.tasks         tasks on the step
 * @param {string}   args.userId        current user
 * @param {boolean}  args.mayAct        matrix verdict for this step + record
 * @param {boolean}  args.matrixApplies false when the module has no authzModule
 * @param {string}  [args.kind]         task kind to consider ('APPROVAL')
 * @param {string[]}[args.statuses]     actionable statuses
 * @returns {{ task: object|null, isTakeover: boolean, assigneeId: string|null }}
 */
export function pickActionableTask({
  tasks = [],
  userId,
  mayAct = false,
  matrixApplies = true,
  kind = 'APPROVAL',
  statuses = ACTIONABLE_TASK_STATUSES,
}) {
  const eligible = tasks.filter(
    (t) => (!kind || t.taskKindId === kind) && statuses.includes(t.statusId),
  )

  // `userId &&` matters: two undefineds compare equal, which would hand an
  // unassigned task to anyone as if it were their own.
  const mine = userId ? eligible.find((t) => t.assignedTo === userId) : null

  // Where the matrix cannot be consulted — resource types with no scope inputs,
  // whose module carries no authzModule — the assignee is the only actor, as
  // before. Enforcing a verb we cannot evaluate would strand those steps.
  if (!matrixApplies) {
    return mine
      ? { task: mine, isTakeover: false, assigneeId: mine.assignedTo }
      : { task: null, isTakeover: false, assigneeId: null }
  }

  // Otherwise the verb is required of everyone, the assignee included. Being
  // assigned an approval step is not a grant of `approve` — otherwise the grant
  // would mean nothing, since anyone can be assigned.
  if (!mayAct) return { task: null, isTakeover: false, assigneeId: null }

  if (mine) return { task: mine, isTakeover: false, assigneeId: mine.assignedTo }

  const other = eligible.find((t) => t.assignedTo && t.assignedTo !== userId) || null
  return {
    task: other,
    isTakeover: !!other,
    assigneeId: other?.assignedTo ?? null,
  }
}

/**
 * Would the matrix let this user act on a step of this type, for this record?
 *
 * A hint, exactly like the rest of isAllowedOnRecord's callers — the server
 * re-decides on every action. Returns false when the module has no
 * `authzModule`, which is how the assignee-only resource types (DocumentVersion,
 * InspectionLot, LogBook, Specification) keep their current behaviour without a
 * second list to maintain.
 */
export function mayActOnStepType({ module, record, stepType }) {
  const permission = permissionForStep(module?.authzModule, stepType)
  if (!permission || !record) return false
  return isAllowedOnRecord(permission, record)
}

/**
 * Label for an action the user is taking on someone else's behalf.
 * `Approve` → `Approve on behalf of Sam Patel`.
 */
export function onBehalfOfLabel(baseLabel, assigneeName) {
  if (!assigneeName) return `${baseLabel} on behalf of the assignee`
  return `${baseLabel} on behalf of ${assigneeName}`
}
