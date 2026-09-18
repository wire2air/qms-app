/**
 * Flipping the "default workflow for this module" flag.
 *
 * At most one per (company, module) is a DATABASE guarantee, not a convention:
 * workflows_one_default_per_module is a partial unique index over
 * (company_id, module_id) WHERE is_default AND deleted_at IS NULL. So the
 * previous default must be cleared BEFORE the new one is set — the other order
 * has two live defaults for the duration of one statement and the index
 * rejects the write.
 *
 * That ordering is the whole reason this lives in one place rather than being
 * repeated in the card list, the Templates list and the editor.
 */
import { describe, it, expect, vi } from 'vitest'
import { toggleWorkflowDefault, moduleLabel } from '../components/workflow/workflowDefault.js'

function wf(over = {}) {
  const w = { id: 'w1', name: 'Flow', moduleId: 'CAPA', isDefault: false, ...over }
  w.save = vi.fn(async () => {})
  return w
}

describe('toggleWorkflowDefault', () => {
  it('clears the previous default BEFORE setting the new one', async () => {
    const order = []
    const target = wf({ id: 'new' })
    const current = wf({ id: 'old', isDefault: true })
    current.save = vi.fn(async () => order.push('cleared old'))
    target.save = vi.fn(async () => order.push('set new'))

    await toggleWorkflowDefault(target, [current, target])

    expect(order).toEqual(['cleared old', 'set new'])
    expect(current.isDefault).toBe(false)
    expect(target.isDefault).toBe(true)
  })

  it('only clears a default in the SAME module', async () => {
    const target = wf({ id: 'new', moduleId: 'CAPA' })
    const otherModule = wf({ id: 'nc', moduleId: 'NON_CONFORMANCE', isDefault: true })
    await toggleWorkflowDefault(target, [otherModule, target])
    expect(otherModule.isDefault).toBe(true)
    expect(otherModule.save).not.toHaveBeenCalled()
  })

  it('turns the flag off when it was already on', async () => {
    const target = wf({ isDefault: true })
    const msg = await toggleWorkflowDefault(target, [target])
    expect(target.isDefault).toBe(false)
    expect(msg).toMatch(/no longer the default/)
  })

  it('does not try to clear itself', async () => {
    // Self-clearing would set isDefault false and then true on one row.
    const target = wf({ id: 'w1', isDefault: false })
    const stale = { ...target, id: 'w1', isDefault: true, save: vi.fn() }
    await toggleWorkflowDefault(target, [stale, target])
    expect(stale.save).not.toHaveBeenCalled()
    expect(target.isDefault).toBe(true)
  })

  it('handles being the first default in its module', async () => {
    const target = wf()
    const msg = await toggleWorkflowDefault(target, [target])
    expect(target.isDefault).toBe(true)
    expect(msg).toMatch(/is now the default/)
  })

  it('is a no-op without a workflow', async () => {
    expect(await toggleWorkflowDefault(null, [])).toBe('')
  })
})

describe('moduleLabel', () => {
  it('reads as prose in the confirmation', () => {
    expect(moduleLabel('NON_CONFORMANCE')).toBe('non conformance')
    expect(moduleLabel('CAPA')).toBe('capa')
    expect(moduleLabel(undefined)).toBe('')
  })
})
