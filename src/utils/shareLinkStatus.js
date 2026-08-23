import { DateTime } from 'luxon'

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
 */
export const SHARE_LINK_STATUSES = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  WITHDRAWN: 'WITHDRAWN',
}

export function shareLinkStatus(link) {
  if (!link) return null
  if (link.revokedAt) return SHARE_LINK_STATUSES.WITHDRAWN
  if (link.expiresAt && link.expiresAt <= DateTime.now()) return SHARE_LINK_STATUSES.EXPIRED
  return SHARE_LINK_STATUSES.ACTIVE
}

/** Human label, for CSV export and search — the badge renders its own. */
export const SHARE_LINK_STATUS_LABELS = {
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  WITHDRAWN: 'Withdrawn',
}
