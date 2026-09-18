/**
 * editTracker — tracks UNFLUSHED local edits per model instance so hydrate()
 * never clobbers a user's change that hasn't reached the server yet.
 *
 * The bug this exists for: the save pipeline is pessimistic and
 * server-authoritative — after a save (or any live-query re-run / socket
 * fetch), hydrate() overwrites the pooled instance from the IDB/server record.
 * Any field the user edited while a previous save was in flight (or within the
 * debounce window of an inline-edit autosave) was silently reverted, and the
 * follow-up save then diffed the already-reverted instance into an empty
 * patch — the edit was lost. Symptom: toggling a workflow step's type "snaps
 * back" and can never be changed again while saves are in flight.
 *
 * Mechanism: every user-land property write (via observabilityHelper's setter)
 * marks the field edited with a monotonically increasing sequence number.
 * Writes performed by hydrate() itself are exempt via the hydration flag.
 * hydrate() skips fields currently marked edited on an existing pooled
 * instance. directSaveStrategy snapshots the edit set when it builds a patch
 * and clears exactly those entries after the server acks — an edit made DURING
 * the flight has a newer sequence than the snapshot and survives the clear, so
 * it stays protected until its own save flushes it. On save failure nothing is
 * cleared, so unflushed edits remain protected for the retry.
 *
 * Zero imports on purpose — consumed by observabilityHelper (reactivity core),
 * hydration, and directSaveStrategy without creating dependency cycles.
 */

/** @type {WeakMap<object, Map<string, number>>} instance → field → edit seq */
const edits = new WeakMap()
let seq = 0
let hydrating = false

/** Enter hydration: property writes are engine-driven, not user edits. */
export function beginHydration() {
  hydrating = true
}

/** Leave hydration (always call from a finally). */
export function endHydration() {
  hydrating = false
}

/** Record a user-land edit to a field. No-op while hydrating. */
export function markEdited(instance, field) {
  if (hydrating) return
  let map = edits.get(instance)
  if (!map) {
    map = new Map()
    edits.set(instance, map)
  }
  map.set(field, ++seq)
}

/** Is this field carrying an unflushed local edit? */
export function isEdited(instance, field) {
  return edits.get(instance)?.has(field) ?? false
}

/** Copy the current edit set (field → seq) for later reconciliation. */
export function snapshotEdits(instance) {
  const map = edits.get(instance)
  return map ? new Map(map) : new Map()
}

/**
 * Clear edits that were captured by a snapshot and have NOT been re-edited
 * since (their seq hasn't advanced). Called after a successful save so
 * mid-flight edits — which carry a newer seq — remain protected.
 */
export function clearEditsUpTo(instance, snapshot) {
  const map = edits.get(instance)
  if (!map) return
  for (const [field, snapSeq] of snapshot) {
    if ((map.get(field) ?? 0) <= snapSeq) map.delete(field)
  }
  if (map.size === 0) edits.delete(instance)
}

/** Drop every tracked edit (successful CREATE / full dehydrate persisted all fields). */
export function clearAllEdits(instance) {
  edits.delete(instance)
}
