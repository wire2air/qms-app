import { ref } from 'vue'

/**
 * Cross-module navigation trail (breadcrumb of *records*, not routes).
 *
 * As the user hops from one record to another via in-page links — e.g. an
 * Inspection Lot → the NC it raised → the CAPA that NC spawned — each detail
 * page calls `visit()` to append itself to the trail. The breadcrumb then lets
 * the user step back up the chain. Clicking a left-nav item calls `reset()` so a
 * fresh chain starts (the user explicitly left the record context).
 *
 * Behaviour of `visit()`:
 *   • Same path as the last entry  → no-op (just refresh the label).
 *   • Path already earlier in trail → truncate to it (back navigation).
 *   • Otherwise                     → append.
 *
 * Persisted to sessionStorage so a page refresh keeps the chain (each detail
 * page re-`visit()`s on mount, but without persistence the prior chain would be
 * lost). Scoped to the tab/session — intentionally not shared across tabs.
 */
const STORAGE_KEY = 'qms.recordTrail'

function load() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const trail = ref(load())

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trail.value))
  } catch {
    /* sessionStorage unavailable (private mode / quota) — trail stays in-memory */
  }
}

export function useRecordTrail() {
  function visit({ type, id, label, path }) {
    if (!id || !path) return
    const idx = trail.value.findIndex((e) => e.path === path)
    const entry = { type: type ?? '', id, label: label ?? '', path }
    if (idx !== -1) {
      // Returning to a record already in the chain — drop everything after it.
      const next = trail.value.slice(0, idx + 1)
      next[idx] = entry
      trail.value = next
    } else {
      trail.value = [...trail.value, entry]
    }
    persist()
  }

  function reset() {
    if (trail.value.length) {
      trail.value = []
      persist()
    }
  }

  return { trail, visit, reset }
}
