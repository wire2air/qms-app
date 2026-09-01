import { describe, it, expect, vi } from 'vitest'
import { buildUserSections, buildUserActions } from './userDetailConfig.js'

describe('buildUserSections', () => {
  it('returns a single details section', () => {
    const s = buildUserSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('details')
  })
})

describe('buildUserActions', () => {
  const visibleIds = (gates) =>
    buildUserActions(gates, {})
      .filter((a) => a.visible)
      .map((a) => a.id)

  // Needs the user loaded AND the trail's own grant: `audit_log_select_rls`
  // keys on `audit_trail:read`, which user_management:read does not imply, so
  // without it the dialog has no rows and only tells the user no.
  it('Audit Log needs a loaded user and canViewAuditTrail', () => {
    expect(visibleIds({ hasUser: true, canViewAuditTrail: true })).toContain('auditLog')
    expect(visibleIds({ hasUser: true })).not.toContain('auditLog')
    expect(visibleIds({ canViewAuditTrail: true })).not.toContain('auditLog')
  })

  it('Send Invitation shows only for an un-invited user with canUpdate', () => {
    expect(visibleIds({ canUpdate: true, hasUser: true })).toContain('sendInvite')
    expect(visibleIds({ canUpdate: true, hasUser: true, inviteSent: true })).not.toContain(
      'sendInvite',
    )
    expect(visibleIds({ hasUser: true })).not.toContain('sendInvite')
  })

  it('Send Invitation reflects the sendingInvite loading flag', () => {
    const s = buildUserActions({ canUpdate: true, hasUser: true, sendingInvite: true }, {}).find(
      (a) => a.id === 'sendInvite',
    )
    expect(s.loading).toBe(true)
    expect(s.variant).toBe('primary')
  })

  it('wires handlers to onSelect', () => {
    const handlers = { sendInvite: vi.fn(), openAuditLog: vi.fn() }
    const a = buildUserActions({}, handlers)
    a.forEach((d) => d.onSelect())
    Object.values(handlers).forEach((fn) => expect(fn).toHaveBeenCalled())
  })
})
