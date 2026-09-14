/**
 * The state of a share link, derived from the row.
 *
 * There is no status column, and deliberately so: revocation and expiry are
 * both re-checked server-side on every request, so a stored status would be a
 * second copy of the truth that could disagree with the endpoint actually
 * serving the record. Derive it here, once, and let every surface read the
 * same answer.
 *
 * Order matters. A link that was withdrawn AND has since passed its expiry is
 * WITHDRAWN — somebody took the access away, which is the fact worth showing.
 *
 * `expiresAt` is compared as epoch milliseconds, whatever shape it arrives in.
 * The synced model hands over a Luxon DateTime, but a raw REST `shareLink`
 * (the create/revoke responses) carries an ISO string, and a Date is one
 * `new Date()` away. The previous `link.expiresAt <= DateTime.now()` only
 * worked for the first: an ISO string compared against a DateTime coerces to
 * NaN, NaN <= x is false, and an EXPIRED link read ACTIVE.
 */
export const SHARE_LINK_STATUSES = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  WITHDRAWN: 'WITHDRAWN',
}

/** Epoch ms for a DateTime / Date / ISO string / number, or null if unreadable. */
function toMillis(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/**
 * @param {object|null} link  a RecordShareLink (model instance or plain object)
 * @param {number} [now]      epoch ms; injectable so the boundary is testable
 */
export function shareLinkStatus(link, now = Date.now()) {
  if (!link) return null
  if (link.revokedAt) return SHARE_LINK_STATUSES.WITHDRAWN
  const expires = toMillis(link.expiresAt)
  if (expires !== null && expires <= now) return SHARE_LINK_STATUSES.EXPIRED
  return SHARE_LINK_STATUSES.ACTIVE
}

/** Human label, for CSV export and search — the badge renders its own. */
export const SHARE_LINK_STATUS_LABELS = {
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  WITHDRAWN: 'Withdrawn',
}
