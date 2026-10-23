import MiniSearch from 'minisearch'
import helpData from '@/content/help.generated.json'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: in-app help
// is read from the knowledge base through the QMS help service, not synced.
import { get } from '@/api'

/**
 * In-app Help Center content access + search.
 *
 * TWO SOURCES (docs/plans/knowledge-base-phase2-5.md §5):
 *   kb      the Support Desk knowledge base, through the QMS help service
 *           (/v1/services/help/*): articles for signed-in customers, edited
 *           in the desk, no app release needed. Article HTML is fetched when
 *           an article opens.
 *   bundle  `src/content/help.generated.json`, built from `content/help/**`
 *           (scripts/build-help-content.mjs). Used until the service answers,
 *           and whenever it is not configured (503 HELP_NOT_CONFIGURED).
 *
 * Article slugs are the same in both: a KB article's external key IS the old
 * help slug (`KB/quality/capas`), so every helpSlug link in the app works
 * with either source.
 */

const state = reactive({
  source: 'bundle',
  articles: helpData.articles ?? [],
  categories: helpData.categories ?? [],
})
const htmlCache = new Map()

function buildIndex(articles) {
  const mini = new MiniSearch({
    idField: 'slug',
    fields: ['title', 'description', 'keywords', 'body'],
    storeFields: ['slug', 'title', 'description', 'section', 'category'],
    searchOptions: {
      boost: { title: 4, keywords: 3, description: 2 },
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND',
    },
  })
  mini.addAll(
    articles.map((a) => ({
      ...a,
      body: a.body || '',
      keywords: Array.isArray(a.keywords) ? a.keywords.join(' ') : a.keywords || '',
    })),
  )
  return mini
}
let mini = buildIndex(state.articles)

/** The help service's index → the shape the Help pages read. */
function fromKbIndex(idx) {
  const cols = idx?.collections || []
  const byId = new Map(cols.map((c) => [c.id, c]))
  function pathOf(c) {
    if (c.path) return c.path
    const parts = []
    let cur = c
    while (cur) {
      parts.unshift(cur.slug || cur.title)
      cur = cur.parentId ? byId.get(cur.parentId) : null
    }
    return parts.join('/')
  }
  const categories = cols.map((c) => ({
    dir: pathOf(c),
    label: c.title,
    order: c.position ?? 999,
    section: pathOf(c).split('/')[0],
  }))
  const dirById = new Map(cols.map((c) => [c.id, pathOf(c)]))
  const articles = (idx?.articles || [])
    .filter((a) => a.key)
    .map((a) => ({
      slug: a.key,
      title: a.title,
      description: a.summary || '',
      keywords: a.tags || [],
      category: dirById.get(a.collectionId) || '',
      order: a.position ?? 999,
      section: (dirById.get(a.collectionId) || '').split('/')[0],
      source: 'kb',
    }))
  return { articles, categories }
}

let loading = null
/** Switch to the knowledge base when the help service is configured. Once per session. */
export function loadHelpFromKb() {
  if (!loading)
    loading = get('/v1/services/help/index')
      .then((idx) => {
        const { articles, categories } = fromKbIndex(idx)
        if (!articles.length) return
        state.articles = articles
        state.categories = categories
        state.source = 'kb'
        mini = buildIndex(articles)
      })
      .catch(() => {
        // Not configured (503) or unreachable: keep the bundled help.
      })
  return loading
}

/** A KB article's rendered HTML (server-sanitized; sanitized again where shown). */
export async function fetchHelpArticleHtml(slug) {
  if (htmlCache.has(slug)) return htmlCache.get(slug)
  const res = await get('/v1/services/help/article', { params: { key: slug } })
  const html = res?.article?.html ?? res?.html ?? ''
  htmlCache.set(slug, html)
  return html
}

export function useHelpContent() {
  loadHelpFromKb()

  function categoryLabel(dir) {
    return (
      state.categories.find((c) => c.dir === dir)?.label ||
      String(dir || '')
        .split('/')
        .pop()
    )
  }

  function search(query) {
    const q = (query ?? '').trim()
    if (!q) return []
    return mini.search(q)
  }

  function getArticle(slug) {
    return state.articles.find((a) => a.slug === slug) ?? null
  }

  /**
   * Articles grouped into ordered categories for the landing page:
   *   [{ dir, label, order, section, articles: [...] }]
   */
  function grouped() {
    const order = new Map(state.categories.map((c) => [c.dir, c.order ?? 999]))
    const byDir = new Map()
    for (const a of state.articles) {
      if (!byDir.has(a.category)) byDir.set(a.category, [])
      byDir.get(a.category).push(a)
    }
    return [...byDir.entries()]
      .map(([dir, list]) => ({
        dir,
        label: categoryLabel(dir),
        order: order.get(dir) ?? 999,
        section: String(dir || '').split('/')[0],
        articles: list
          .slice()
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  }

  return {
    get articles() {
      return state.articles
    },
    get categories() {
      return state.categories
    },
    source: computed(() => state.source),
    search,
    getArticle,
    grouped,
    categoryLabel,
  }
}
