import MiniSearch from 'minisearch'
import helpData from '@/content/help.generated.json'

/**
 * In-app Help Center content access + search.
 *
 * The bundle (`src/content/help.generated.json`) is produced from the canonical
 * Markdown under `content/help/**` by `scripts/build-help-content.mjs` (runs on
 * predev/prebuild). This composable is the single read path for the Help pages:
 * article lookup, category grouping, and full-text search via MiniSearch.
 *
 * The MiniSearch index is built once at module load (the content is static for
 * the app version), so it's shared across every call. Keep this composable
 * imported only by Help components so the bundle code-splits into the help chunk.
 */

const articles = helpData.articles ?? []
const categories = helpData.categories ?? []

const articlesBySlug = new Map(articles.map((a) => [a.slug, a]))
const categoryByDir = new Map(categories.map((c) => [c.dir, c]))

// title/keywords/description weighted above body; prefix + light fuzzy so partial
// and slightly-misspelled queries still surface the right article.
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
  articles.map((a) => ({ ...a, keywords: Array.isArray(a.keywords) ? a.keywords.join(' ') : '' })),
)

function categoryLabel(dir) {
  return categoryByDir.get(dir)?.label || dir.split('/').pop()
}

export function useHelpContent() {
  function search(query) {
    const q = (query ?? '').trim()
    if (!q) return []
    return mini.search(q)
  }

  function getArticle(slug) {
    return articlesBySlug.get(slug) ?? null
  }

  /**
   * Articles grouped into ordered categories for the landing page:
   *   [{ dir, label, order, section, articles: [...] }]
   * Categories are ordered by their _category_.json position, articles by
   * sidebar_position then title.
   */
  function grouped() {
    const byDir = new Map()
    for (const a of articles) {
      if (!byDir.has(a.category)) byDir.set(a.category, [])
      byDir.get(a.category).push(a)
    }
    return [...byDir.entries()]
      .map(([dir, list]) => ({
        dir,
        label: categoryLabel(dir),
        order: categoryByDir.get(dir)?.order ?? 999,
        section: dir.split('/')[0],
        articles: list
          .slice()
          .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  }

  return { articles, categories, search, getArticle, grouped, categoryLabel }
}
