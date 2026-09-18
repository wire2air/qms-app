/**
 * Persisting a new step order without tripping the unique index.
 *
 * `uq_workflow_steps_version_order` is UNIQUE on
 * (workflow_version_id, step_order) WHERE deleted_at IS NULL. Any in-place
 * renumber therefore collides part-way through: give step A the order step B
 * still holds and that write is rejected.
 *
 * The old swap did exactly that, concurrently:
 *
 *     a.stepOrder = b.stepOrder
 *     b.stepOrder = tmpOrder
 *     await Promise.all([a.save(), b.save()])
 *
 * whichever landed first violated the index, the promise rejected, and nothing
 * was persisted. It looked broken on NC and fine on CAPA for a reason worth
 * remembering: CAPA renders `rootSteps`, a computed that re-sorts the moment
 * the reactive stepOrder changes, so the row visibly moved and then silently
 * failed to save. NC's flat list has no such re-sort, so nothing moved at all.
 * Both were broken; only one admitted it. (Reported 2026-08-16.)
 *
 * So: park every step in a free numbering band first, then land the final
 * 1..n. Two passes, sequential — the whole point is that no intermediate state
 * may collide, which rules out Promise.all.
 */

/** Reorder `ids` within `steps`, returning the steps in their new order. */
export function reorderedSteps(steps, orderedIds) {
  const byId = new Map((steps ?? []).map((s) => [s.id, s]))
  const out = []
  for (const id of orderedIds ?? []) {
    const s = byId.get(id)
    if (s) {
      out.push(s)
      byId.delete(id)
    }
  }
  // Anything the caller didn't mention keeps its relative position at the end,
  // so a stale id list can never drop a step.
  for (const s of byId.values()) out.push(s)
  return out
}

/** Move one element, returning the new id order. Out-of-range is a no-op. */
export function movedIdOrder(steps, fromIndex, toIndex) {
  const ids = (steps ?? []).map((s) => s.id)
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ids.length ||
    toIndex >= ids.length ||
    fromIndex === toIndex
  ) {
    return ids
  }
  const next = [...ids]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

/**
 * The free band to park in: above every order currently live on this version,
 * so pass one cannot collide with a row pass two hasn't reached yet.
 */
export function parkingBase(steps) {
  const max = (steps ?? []).reduce((m, s) => Math.max(m, s.stepOrder ?? 0), 0)
  return max + 1
}

/**
 * Write `orderedIds` as step_order 1..n.
 *
 * @param {object[]} steps  every live step on the version (ordering scope)
 * @param {string[]} orderedIds  desired order
 */
export async function persistStepOrder(steps, orderedIds) {
  const ordered = reorderedSteps(steps, orderedIds)
  if (ordered.length < 2) return ordered

  // Already correct? Don't write 2N rows for a no-op drag.
  if (ordered.every((s, i) => s.stepOrder === i + 1)) return ordered

  const base = parkingBase(steps)
  for (let i = 0; i < ordered.length; i++) {
    ordered[i].stepOrder = base + i
    await ordered[i].save()
  }
  for (let i = 0; i < ordered.length; i++) {
    ordered[i].stepOrder = i + 1
    await ordered[i].save()
  }
  return ordered
}
