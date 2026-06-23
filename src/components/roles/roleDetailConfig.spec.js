import { describe, it, expect, vi } from 'vitest'
import { buildRoleSections, buildRoleActions } from './roleDetailConfig.js'

describe('buildRoleSections', () => {
  it('returns a single permissions section', () => {
    const s = buildRoleSections(null)
    expect(s).toHaveLength(1)
    expect(s[0].id).toBe('permissions')
  })
})

describe('buildRoleActions', () => {
  const visibleIds = (gates) =>
    buildRoleActions(gates, {})
      .filter((a) => a.visible)
      .map((a) => a.id)

  it('canUpdate shows Save + Cancel', () => {
    expect(visibleIds({ canUpdate: true })).toEqual(expect.arrayContaining(['save', 'cancel']))
  })

  it('nothing editable without canUpdate', () => {
    expect(visibleIds({})).toEqual([])
  })

  it('Activate shows only for an inactive role; Deactivate only for an active one', () => {
    expect(visibleIds({ canUpdate: true, hasRole: true, isInactive: true })).toContain('activate')
    expect(visibleIds({ canUpdate: true, hasRole: true, isInactive: true })).not.toContain(
      'deactivate',
    )
    expect(visibleIds({ canUpdate: true, hasRole: true, isInactive: false })).toContain(
      'deactivate',
    )
    expect(visibleIds({ canUpdate: true, hasRole: true, isInactive: false })).not.toContain(
      'activate',
    )
  })

  it('Save is the primary action and reflects the saving flag', () => {
    const save = buildRoleActions({ canUpdate: true, saving: true }, {}).find((a) => a.id === 'save')
    expect(save.variant).toBe('primary')
    expect(save.disabled).toBe(true)
    expect(save.loading).toBe(true)
  })

  it('wires handlers to onSelect', () => {
    const handlers = { save: vi.fn(), cancel: vi.fn(), activate: vi.fn(), deactivate: vi.fn() }
    const a = buildRoleActions({}, handlers)
    a.forEach((d) => d.onSelect())
    Object.values(handlers).forEach((fn) => expect(fn).toHaveBeenCalled())
  })
})
