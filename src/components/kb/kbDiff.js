/**
 * Line diff of two texts (an article's Markdown in two versions), for the
 * history view: [{ type: 'same' | 'add' | 'del', text }]. Longest common
 * subsequence over lines after the common head and tail are set aside;
 * articles are short, so the table stays small.
 */
export function lineDiff(before, after) {
  const a = String(before ?? '').split('\n')
  const b = String(after ?? '').split('\n')
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail++
  const A = a.slice(head, a.length - tail)
  const B = b.slice(head, b.length - tail)
  const out = a.slice(0, head).map((text) => ({ type: 'same', text }))
  if (A.length * B.length > 4_000_000) {
    // Too large to compare line by line: show it as replaced.
    out.push(
      ...A.map((text) => ({ type: 'del', text })),
      ...B.map((text) => ({ type: 'add', text })),
    )
  } else {
    const n = A.length
    const m = B.length
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (A[i] === B[j]) {
        out.push({ type: 'same', text: A[i] })
        i++
        j++
      } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ type: 'del', text: A[i++] })
      else out.push({ type: 'add', text: B[j++] })
    }
    while (i < n) out.push({ type: 'del', text: A[i++] })
    while (j < m) out.push({ type: 'add', text: B[j++] })
  }
  out.push(...a.slice(a.length - tail).map((text) => ({ type: 'same', text })))
  return out
}

/** The diff with long unchanged runs folded: rows of a line or { type: 'skip', count }. */
export function foldDiff(rows, context = 3) {
  const keep = rows.map((r) => r.type !== 'same')
  const near = rows.map((_, i) => {
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++)
      if (keep[k]) return true
    return false
  })
  const out = []
  let skipped = 0
  rows.forEach((r, i) => {
    if (near[i]) {
      if (skipped) out.push({ type: 'skip', count: skipped })
      skipped = 0
      out.push(r)
    } else skipped++
  })
  if (skipped) out.push({ type: 'skip', count: skipped })
  return out
}

export function diffStats(rows) {
  return {
    added: rows.filter((r) => r.type === 'add').length,
    removed: rows.filter((r) => r.type === 'del').length,
  }
}
