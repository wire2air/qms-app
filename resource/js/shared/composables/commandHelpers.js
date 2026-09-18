/**
 * Pure helpers for the command palette (Enterprise Page Framework C4 / L1).
 * Fuzzy scoring + filtering + grouping, side-effect-free for easy unit testing.
 */

/**
 * Score how well `query` matches `text`. 0 = no match; higher = better.
 * Substring matches outrank subsequence matches; earlier matches outrank later.
 */
export function fuzzyScore(query, text) {
  const q = (query || '').toLowerCase().trim()
  const t = (text || '').toLowerCase()
  if (!q) return 1
  const idx = t.indexOf(q)
  if (idx !== -1) return 1000 - Math.min(idx, 900)
  // Subsequence fallback: every query char appears in order.
  let qi = 0
  let score = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi += 1
      score += 1
    }
  }
  return qi === q.length ? score : 0
}

/** The haystack a command is matched against (title + group + keywords). */
function haystack(cmd) {
  return [cmd.title, cmd.group, ...(cmd.keywords || [])].filter(Boolean).join(' ')
}

/**
 * Filter + rank commands for a query. Empty query → the list unchanged (capped).
 * Otherwise keeps positive-scoring commands, best first (stable on ties).
 */
export function filterCommands(commands = [], query = '', { limit = 50 } = {}) {
  const q = (query || '').trim()
  if (!q) return commands.slice(0, limit)
  return commands
    .map((c, i) => ({ c, i, score: fuzzyScore(q, haystack(c)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c)
}

/** Group commands by their `group` (preserving first-seen group order). */
export function groupCommands(commands = []) {
  const map = new Map()
  for (const c of commands) {
    const g = c.group || 'Other'
    if (!map.has(g)) map.set(g, [])
    map.get(g).push(c)
  }
  return [...map.entries()].map(([group, items]) => ({ group, items }))
}
