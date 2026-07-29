/**
 * Internal Docs Center state — the platform-operator browser over
 * qms/docs/modules (manifest + content + search served by /v1/platform/docs/*).
 *
 * Module-scope singletons: the manifest, content cache, search index and
 * recently-viewed list survive route changes, so navigating the corpus never
 * refetches what a session already loaded. Content is sensitive (security
 * reviews, readiness verdicts) — it is fetched per-doc from the gated API and
 * never bundled.
 */
import MiniSearch from 'minisearch'
import {
  fetchDocsManifest,
  fetchDocsSearchIndex,
  fetchDocContent,
} from '@/api/internalDocs.js'

const manifest = ref(null)
const manifestError = ref(null)
let manifestPromise = null

const contentCache = new Map()
let mini = null
let indexById = null
let searchPromise = null

const searchOpen = ref(false)

const RECENT_KEY = 'internal-docs:recent'
const FAVORITES_KEY = 'internal-docs:favorites'
const RECENT_LIMIT = 8

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage unavailable/full — recents/favorites are best-effort only
  }
}

const recentIds = ref(readJson(RECENT_KEY, []))
const favoriteIds = ref(readJson(FAVORITES_KEY, []))

const modulesBySlug = computed(() => {
  const map = new Map()
  for (const m of manifest.value?.modules ?? []) map.set(m.slug, m)
  return map
})

// Every doc (pack + flat) by id, enriched with its module/group context.
const docsById = computed(() => {
  const map = new Map()
  for (const m of manifest.value?.modules ?? []) {
    for (const g of m.groups) {
      for (const d of g.docs) {
        map.set(d.id, {
          ...d,
          flat: false,
          moduleSlug: m.slug,
          moduleName: m.name,
          groupKey: g.key,
          groupLabel: g.label,
        })
      }
    }
  }
  for (const d of manifest.value?.platformDocs ?? []) {
    map.set(d.id, { ...d, flat: true, moduleSlug: null, moduleName: null, groupLabel: d.category })
  }
  return map
})

const totalDocCount = computed(() => docsById.value.size)

function loadManifest() {
  if (manifest.value) return Promise.resolve(manifest.value)
  if (!manifestPromise) {
    manifestError.value = null
    manifestPromise = fetchDocsManifest()
      .then((data) => {
        manifest.value = data
        return data
      })
      .catch((err) => {
        manifestError.value = err
        throw err
      })
      .finally(() => {
        manifestPromise = null
      })
  }
  return manifestPromise
}

/** Classify a /docs/<slugPath> route: pack home, single doc, or unknown. */
function resolvePath(slugPath) {
  if (!manifest.value) return { kind: 'loading' }
  const module = modulesBySlug.value.get(slugPath)
  if (module) return { kind: 'module', module }
  const doc = docsById.value.get(slugPath)
  if (doc) return { kind: 'doc', doc }
  return { kind: 'missing' }
}

/** The reading order of a pack: its groups flattened (00 → 20 → prior cycle). */
function packSequence(moduleSlug) {
  const m = modulesBySlug.value.get(moduleSlug)
  return m ? m.groups.flatMap((g) => g.docs) : []
}

function navigationFor(docId) {
  const doc = docsById.value.get(docId)
  if (!doc || doc.flat) return { prev: null, next: null }
  const seq = packSequence(doc.moduleSlug)
  const i = seq.findIndex((d) => d.id === docId)
  return {
    prev: i > 0 ? seq[i - 1] : null,
    next: i >= 0 && i < seq.length - 1 ? seq[i + 1] : null,
  }
}

/** The three most-wanted entry points of a pack, when present. */
function quickLinksFor(module) {
  const all = module.groups.flatMap((g) => g.docs)
  function byNumber(n) {
    return all.find((d) => d.number === n) ?? null
  }
  return {
    overview: byNumber(1),
    qaGuide: byNumber(12),
    execSummary: byNumber(20),
  }
}

async function loadDoc(id) {
  if (contentCache.has(id)) return contentCache.get(id)
  const { doc } = await fetchDocContent(id)
  contentCache.set(id, doc)
  return doc
}

function trackVisit(id) {
  const next = [id, ...recentIds.value.filter((r) => r !== id)].slice(0, RECENT_LIMIT)
  recentIds.value = next
  writeJson(RECENT_KEY, next)
}

function isFavorite(id) {
  return favoriteIds.value.includes(id)
}

function toggleFavorite(id) {
  const next = isFavorite(id)
    ? favoriteIds.value.filter((f) => f !== id)
    : [...favoriteIds.value, id]
  favoriteIds.value = next
  writeJson(FAVORITES_KEY, next)
}

/**
 * Cycle dates arrive as plain `YYYY-MM-DD` strings, but the axios response
 * transformer may upgrade ISO-like strings to luxon DateTimes — display either.
 */
function cycleLabel(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.toISODate?.() ?? String(value)
}

// ── Search ──────────────────────────────────────────────────────────────────

// Queries that look like the corpus's stable reference ids (BS-07, TC-12,
// PW-J3, R4 …) get an exact refs-field pass before general search.
const REF_QUERY_RE = /^(?:bs|tc|atc|pw-?j|api|j|p|s|r|c|h|m)-?\d/i

async function ensureSearchIndex() {
  if (mini) return
  if (!searchPromise) {
    searchPromise = Promise.all([loadManifest(), fetchDocsSearchIndex()])
      .then(([, data]) => {
        const entries = data.index ?? []
        indexById = new Map(entries.map((e) => [e.id, e]))
        const built = new MiniSearch({
          idField: 'id',
          fields: ['title', 'moduleName', 'headings', 'refs', 'text'],
          storeFields: ['id'],
          searchOptions: {
            boost: { title: 6, refs: 5, headings: 3, moduleName: 2 },
            prefix: true,
            fuzzy: 0.15,
            combineWith: 'AND',
          },
        })
        built.addAll(
          entries.map((e) => ({
            id: e.id,
            title: e.title ?? '',
            moduleName: e.module
              ? (modulesBySlug.value.get(e.module)?.name ?? e.module)
              : 'Platform docs',
            headings: (e.headings ?? []).join(' '),
            refs: (e.refs ?? []).join(' '),
            text: e.text ?? '',
          })),
        )
        mini = built
      })
      .finally(() => {
        searchPromise = null
      })
  }
  return searchPromise
}

function buildSnippet(text, term) {
  if (!text) return ''
  const idx = text.toLowerCase().indexOf(String(term).toLowerCase())
  if (idx === -1) return text.slice(0, 140)
  const start = Math.max(0, idx - 60)
  const end = Math.min(text.length, idx + 110)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

async function searchDocs(query) {
  const q = query.trim()
  if (!q) return []
  await ensureSearchIndex()

  let hits = []
  if (REF_QUERY_RE.test(q)) {
    hits = mini.search(q, { fields: ['refs'], prefix: true, fuzzy: false, combineWith: 'AND' })
  }
  if (!hits.length) hits = mini.search(q)

  return hits.slice(0, 20).map((hit) => {
    const meta = docsById.value.get(hit.id)
    const raw = indexById.get(hit.id)
    return {
      id: hit.id,
      title: meta?.title ?? raw?.title ?? hit.id,
      moduleName: meta?.flat === false ? meta.moduleName : 'Platform docs',
      groupLabel: meta?.groupLabel ?? '',
      snippet: buildSnippet(raw?.text ?? '', hit.terms?.[0] ?? q),
    }
  })
}

function openSearch() {
  searchOpen.value = true
}

function closeSearch() {
  searchOpen.value = false
}

export function useInternalDocs() {
  return {
    manifest,
    manifestError,
    loadManifest,
    modulesBySlug,
    docsById,
    totalDocCount,
    resolvePath,
    packSequence,
    navigationFor,
    quickLinksFor,
    loadDoc,
    recentIds,
    favoriteIds,
    trackVisit,
    isFavorite,
    toggleFavorite,
    cycleLabel,
    searchDocs,
    searchOpen,
    openSearch,
    closeSearch,
  }
}
