/** Pure layout-state precedence: loading > error > notFound > ready. */
export function resolveDetailState({ loading, error, notFound } = {}) {
  if (loading) return 'loading'
  if (error) return 'error'
  if (notFound) return 'notFound'
  return 'ready'
}

/**
 * Bucket resolved action descriptors into visible buttons + an overflow list.
 * Input must already be flattened (predicates → booleans).
 */
export function bucketActions(actions = [], maxVisible = 3) {
  const shown = actions
    .filter((a) => a.visible !== false)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (y.a.priority ?? 0) - (x.a.priority ?? 0) || x.i - y.i)
    .map(({ a }) => a)

  if (shown.length <= maxVisible) return { visible: shown, overflow: [] }
  return { visible: shown.slice(0, maxVisible - 1), overflow: shown.slice(maxVisible - 1) }
}
