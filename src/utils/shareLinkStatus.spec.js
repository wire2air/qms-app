import { describe, it, expect } from 'vitest'
import { DateTime } from 'luxon'
import {
  shareLinkStatus,
  SHARE_LINK_STATUSES as S,
  SHARE_LINK_STATUS_LABELS,
} from './shareLinkStatus.js'

/**
 * The one derivation of a share link's state (record-sharing, 2026-09-14).
 *
 * Every surface — the rail card, Shared Records, its dialog, the auditee
 * package list — reads this function, and the server enforces the same rule on
 * every request (resolveShareToken: revoked → dead, `expires_at <= now` → dead).
 * A disagreement here shows "Active" on a link the endpoint already refuses.
 *
 * The date-shape table is the regression guard. The previous body compared
 * `link.expiresAt <= DateTime.now()`, which is only correct for a Luxon
 * DateTime: an ISO string compares as NaN, `NaN <= x` is false, and an EXPIRED
 * link read ACTIVE. The raw REST `shareLink` returned by create/revoke carries
 * exactly that string.
 */

const NOW = Date.parse('2026-09-14T12:00:00.000Z')
const HOUR = 3_600_000

const SHAPES = {
  'a Luxon DateTime (synced model)': (ms) => DateTime.fromMillis(ms),
  'an ISO string (raw REST shareLink)': (ms) => new Date(ms).toISOString(),
  'a Date': (ms) => new Date(ms),
  'epoch milliseconds': (ms) => ms,
}

describe('shareLinkStatus', () => {
  it('is null when there is no link', () => {
    expect(shareLinkStatus(null, NOW)).toBeNull()
    expect(shareLinkStatus(undefined, NOW)).toBeNull()
  })

  describe.each(Object.entries(SHAPES))('with expiresAt as %s', (_shape, make) => {
    it('is ACTIVE before the expiry', () => {
      expect(shareLinkStatus({ expiresAt: make(NOW + HOUR) }, NOW)).toBe(S.ACTIVE)
    })

    it('is EXPIRED after the expiry', () => {
      expect(shareLinkStatus({ expiresAt: make(NOW - HOUR) }, NOW)).toBe(S.EXPIRED)
    })

    it('is EXPIRED at the instant of expiry — the server refuses at expires_at <= now', () => {
      expect(shareLinkStatus({ expiresAt: make(NOW) }, NOW)).toBe(S.EXPIRED)
    })

    it('is WITHDRAWN when revoked, even with time left', () => {
      expect(shareLinkStatus({ revokedAt: make(NOW - HOUR), expiresAt: make(NOW + HOUR) }, NOW)).toBe(
        S.WITHDRAWN,
      )
    })
  })

  it('WITHDRAWN outranks EXPIRED — somebody took the access away, which is the fact worth showing', () => {
    const link = { revokedAt: DateTime.fromMillis(NOW - 2 * HOUR), expiresAt: DateTime.fromMillis(NOW - HOUR) }
    expect(shareLinkStatus(link, NOW)).toBe(S.WITHDRAWN)
  })

  it('treats a missing or unreadable expiry as ACTIVE (the server still enforces the real one)', () => {
    expect(shareLinkStatus({ expiresAt: null }, NOW)).toBe(S.ACTIVE)
    expect(shareLinkStatus({ expiresAt: '' }, NOW)).toBe(S.ACTIVE)
    expect(shareLinkStatus({ expiresAt: 'not a date' }, NOW)).toBe(S.ACTIVE)
    expect(shareLinkStatus({}, NOW)).toBe(S.ACTIVE)
  })

  it('reads the real clock when no `now` is given', () => {
    expect(shareLinkStatus({ expiresAt: new Date(Date.now() - 60_000).toISOString() })).toBe(S.EXPIRED)
    expect(shareLinkStatus({ expiresAt: DateTime.now().plus({ days: 30 }) })).toBe(S.ACTIVE)
  })

  it('has a human label for exactly the statuses it can return', () => {
    expect(Object.keys(SHARE_LINK_STATUS_LABELS).sort()).toEqual(Object.values(S).sort())
    expect(SHARE_LINK_STATUS_LABELS).toEqual({ ACTIVE: 'Active', EXPIRED: 'Expired', WITHDRAWN: 'Withdrawn' })
  })
})
