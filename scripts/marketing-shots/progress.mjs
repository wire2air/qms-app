// Terminal progress for the marketing-shot scripts: one line per item with a
// counter, a bar, how long the item took and the time left.
//
//   [ 12/96 ▓▓▓░░░░░░░░░░░░  13%] ✓ capa-register  4.1s  · 1m02s elapsed · ETA 6m40s
//
// `every` prints only every Nth tick (plus failures and the last one), for
// scripts that process hundreds of small files.

function fmt(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

export function createProgress(total, label, { every = 1 } = {}) {
  const start = Date.now()
  let last = start
  let done = 0
  let failed = 0
  const w = String(total).length
  console.info(`\n▶ ${label} — ${total} item${total === 1 ? '' : 's'}`)

  return {
    /** status: true = ok, false = failed, null = skipped */
    tick(status, id, detail = '') {
      done += 1
      if (status === false) failed += 1
      const now = Date.now()
      const took = now - last
      last = now
      if (status !== false && done !== total && done % every !== 0) return
      const elapsed = now - start
      const eta = done < total ? (elapsed / done) * (total - done) : 0
      const pct = total ? Math.round((done / total) * 100) : 100
      const filled = Math.round((pct / 100) * 15)
      const bar = '▓'.repeat(filled) + '░'.repeat(15 - filled)
      const mark = status === true ? '✓' : status === false ? '✗' : '–'
      console.info(
        `[${String(done).padStart(w)}/${total} ${bar} ${String(pct).padStart(3)}%] ${mark} ${id}  ${fmt(took)}` +
          `${detail ? `  ${detail}` : ''}  · ${fmt(elapsed)} elapsed${done < total ? ` · ETA ${fmt(eta)}` : ''}`,
      )
    },
    note(msg) {
      console.info(`  … ${msg}`)
    },
    finish(summary = '') {
      console.info(`\n■ ${label} done in ${fmt(Date.now() - start)} — ${done - failed}/${total} ok${failed ? `, ${failed} failed` : ''}${summary ? ` · ${summary}` : ''}`)
    },
  }
}

/** Run `fn(item, workerIndex)` over `items` with at most `n` running at once. */
export async function pool(items, n, fn) {
  let next = 0
  const worker = async (w) => {
    while (next < items.length) {
      const i = next++
      await fn(items[i], w)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, (_, w) => worker(w)))
}
