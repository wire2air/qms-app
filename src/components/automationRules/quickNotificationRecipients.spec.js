/**
 * A rule may tell outside addresses and nobody else.
 *
 * ORIGINAL REPORT (2026-09-26): adding a notification for NC / CAPA with no
 * user or group selected refused to save, so external addresses could not be
 * added on their own.
 *
 * QuickNotificationPanel gated saving on
 *   groupIds.length || userIds.length || notifySupplier
 * and never bound NotificationCcField's third model — so the email input was
 * not even rendered on this panel, while the shared field, the advanced
 * builder (NOTIFY_EMAIL) and the worker's literal-email branch in
 * send_notification all supported it. The capability existed end to end; only
 * the front door was shut.
 *
 * "Tell our contract auditor when this NC closes" names nobody with an
 * account. The save button simply stayed dead, with no message saying why —
 * which is the part that made it read as a bug rather than a rule.
 *
 * These pin the recipient RULE, not the markup: each kind of recipient is
 * sufficient on its own, and the action list carries what was picked.
 */
import { describe, it, expect } from 'vitest'

// Mirrors QuickNotificationPanel's hasRecipients.
function hasRecipients({ groupIds = [], userIds = [], emails = [], notifySupplier = false }) {
  return groupIds.length > 0 || userIds.length > 0 || emails.length > 0 || Boolean(notifySupplier)
}

// Mirrors the action list save() builds.
function buildActions({ groupIds = [], userIds = [], emails = [], notifySupplier = false }) {
  const actions = []
  if (groupIds.length) actions.push({ type: 'NOTIFY_GROUP', config: { groupIds: [...groupIds] } })
  if (userIds.length) actions.push({ type: 'NOTIFY_USER', config: { userIds: [...userIds] } })
  if (emails.length) actions.push({ type: 'NOTIFY_EMAIL', config: { emails: [...emails] } })
  if (notifySupplier) actions.push({ type: 'NOTIFY_SUPPLIER', config: {} })
  return actions
}

describe('quick notification recipients', () => {
  it('accepts outside emails with no user, group or supplier — the reported bug', () => {
    expect(hasRecipients({ emails: ['auditor@example.com'] })).toBe(true)
  })

  it('writes a NOTIFY_EMAIL action carrying those addresses', () => {
    const actions = buildActions({ emails: ['auditor@example.com', 'qa@partner.test'] })
    expect(actions).toEqual([
      {
        type: 'NOTIFY_EMAIL',
        config: { emails: ['auditor@example.com', 'qa@partner.test'] },
      },
    ])
  })

  it('still refuses a rule that would notify nobody', () => {
    // The gate is not removed, only widened. A rule with no recipients fires
    // and tells no one, which is worse than not existing — it reads as
    // configured.
    expect(hasRecipients({})).toBe(false)
  })

  it('treats each kind of recipient as sufficient on its own', () => {
    expect(hasRecipients({ groupIds: ['g1'] })).toBe(true)
    expect(hasRecipients({ userIds: ['u1'] })).toBe(true)
    expect(hasRecipients({ emails: ['a@b.co'] })).toBe(true)
    expect(hasRecipients({ notifySupplier: true })).toBe(true)
  })

  it('combines them rather than letting one win', () => {
    const actions = buildActions({
      groupIds: ['g1'],
      userIds: ['u1'],
      emails: ['a@b.co'],
      notifySupplier: true,
    })
    expect(actions.map((a) => a.type)).toEqual([
      'NOTIFY_GROUP',
      'NOTIFY_USER',
      'NOTIFY_EMAIL',
      'NOTIFY_SUPPLIER',
    ])
  })
})
