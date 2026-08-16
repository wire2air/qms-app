/**
 * The default workflow for a module — the one auto-selected when a new record
 * is created.
 *
 * At most one per (company, module) is a DATABASE guarantee, not a convention:
 * `workflows_one_default_per_module` is a partial unique index over
 * (company_id, module_id) WHERE is_default AND deleted_at IS NULL. That is why
 * the previous default must be cleared BEFORE the new one is set — doing it
 * the other way round has two live defaults for the duration of one statement
 * and the index rejects the write.
 *
 * Extracted from WorkflowsList so the card list, the merged Templates list and
 * the workflow editor all flip the flag the same way. Three copies of a
 * clear-then-set sequence is three chances to get the order wrong.
 */

/** Human-readable module name for the confirmation message. */
export function moduleLabel(moduleId) {
  return (moduleId ?? '').toLowerCase().replaceAll('_', ' ')
}

/**
 * Toggle `workflow` as the default for its module.
 *
 * @param {object} workflow   the workflow being toggled
 * @param {object[]} siblings every workflow in the company (any module — this
 *   filters to the matching one itself, so callers can pass the whole list)
 * @returns {Promise<string>} a message describing what happened
 */
export async function toggleWorkflowDefault(workflow, siblings = []) {
  if (!workflow) return ''

  if (workflow.isDefault) {
    workflow.isDefault = false
    await workflow.save()
    return `${workflow.name} is no longer the default`
  }

  // Clear first — see the index note above.
  const current = siblings.find(
    (w) => w.moduleId === workflow.moduleId && w.isDefault && w.id !== workflow.id,
  )
  if (current) {
    current.isDefault = false
    await current.save()
  }

  workflow.isDefault = true
  await workflow.save()
  return `${workflow.name} is now the default for new ${moduleLabel(workflow.moduleId)} records`
}
