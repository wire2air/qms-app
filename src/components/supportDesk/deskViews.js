import {
  IconInbox,
  IconUsers,
  IconUserQuestion,
  IconClockPause,
  IconMailOff,
  IconPencil,
} from '@tabler/icons-vue'

/**
 * Support Desk inbox views (spec §3) — the left rail of /desk.
 *
 * Shared with the classic ticket list's quick-filter pills so a ticket shows up
 * in the same view on both surfaces. A view decides WHICH tickets; the list's
 * status toggle (Open / Closed / All) then narrows by lifecycle, except for
 * Snoozed and Spam which are lifecycle-agnostic boxes of their own.
 */
export const OPEN_STATUSES = ['NEW', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CUSTOMER']
export const CLOSED_STATUSES = ['RESOLVED', 'CLOSED', 'CONVERTED_TO_NC']

export const DESK_VIEWS = [
  { id: 'mine', label: 'Your inbox', icon: IconInbox },
  { id: 'created', label: 'Created by you', icon: IconPencil },
  { id: 'all', label: 'All', icon: IconUsers },
  { id: 'unassigned', label: 'Unassigned', icon: IconUserQuestion },
  { id: 'snoozed', label: 'Snoozed', icon: IconClockPause },
  { id: 'spam', label: 'Spam', icon: IconMailOff },
]

export function isSnoozed(r, now = Date.now()) {
  const t =
    r.snoozedUntil?.toMillis?.() ?? (r.snoozedUntil ? new Date(r.snoozedUntil).getTime() : 0)
  return t > now
}

/** Brand ("team inbox") views are `brand:<id>`. */
export function parseView(view) {
  if (typeof view === 'string' && view.startsWith('brand:'))
    return { kind: 'brand', brandId: view.slice(6) }
  return { kind: 'view', id: DESK_VIEWS.some((v) => v.id === view) ? view : 'mine' }
}

/**
 * Does ticket `r` belong in `view`? Pure; `ctx.userId` is the signed-in user.
 * Status narrowing (open/closed) is NOT applied here — see `matchesStatus`.
 */
export function matchesView(r, view, ctx) {
  const v = parseView(view)
  if (v.kind === 'brand') return !r.isSpam && r.brandId === v.brandId
  switch (v.id) {
    case 'spam':
      return !!r.isSpam
    case 'snoozed':
      return !r.isSpam && isSnoozed(r, ctx.now)
    case 'mine':
      return !r.isSpam && r.assignedTo === ctx.userId && !isSnoozed(r, ctx.now)
    case 'created':
      return !r.isSpam && r.createdBy === ctx.userId
    case 'unassigned':
      return !r.isSpam && !r.assignedTo && !isSnoozed(r, ctx.now)
    case 'all':
    default:
      return !r.isSpam && !isSnoozed(r, ctx.now)
  }
}

export function matchesStatus(r, status) {
  if (status === 'open') return OPEN_STATUSES.includes(r.statusId)
  if (status === 'closed') return CLOSED_STATUSES.includes(r.statusId)
  return true
}

/** Rail badge: open tickets in the view (Snoozed/Spam count everything they hold). */
export function viewCounts(rows, brands, ctx) {
  const counts = {}
  for (const v of DESK_VIEWS) {
    const lifecycleAgnostic = v.id === 'snoozed' || v.id === 'spam'
    counts[v.id] = rows.filter(
      (r) => matchesView(r, v.id, ctx) && (lifecycleAgnostic || matchesStatus(r, 'open')),
    ).length
  }
  for (const b of brands) {
    counts[`brand:${b.id}`] = rows.filter(
      (r) => matchesView(r, `brand:${b.id}`, ctx) && matchesStatus(r, 'open'),
    ).length
  }
  return counts
}

/** The instant the conversation last moved — drives list order + the age chip. */
export function lastActivityMs(r) {
  const ms = (t) => (t?.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0)
  return Math.max(ms(r.lastCustomerMessageAt), ms(r.lastAgentMessageAt), ms(r.createdAt))
}

/** True when the ball is in our court: the customer spoke last. */
export function awaitingAgent(r) {
  const ms = (t) => (t?.toMillis ? t.toMillis() : t ? new Date(t).getTime() : 0)
  const customer = ms(r.lastCustomerMessageAt) || ms(r.createdAt)
  const agent = ms(r.lastAgentMessageAt)
  return OPEN_STATUSES.includes(r.statusId) && customer > agent
}
