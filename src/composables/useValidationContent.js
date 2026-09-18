import MiniSearch from 'minisearch'
import validationData from '@/content/validation.generated.json'

/**
 * In-app Validation Package content access + search.
 *
 * Mirrors useHelpContent, over a separate bundle: `content/validation/**` →
 * `src/content/validation.generated.json` (see scripts/build-help-content.mjs).
 *
 * Kept as its own composable rather than a `section` filter on the Help bundle
 * because the two are different kinds of document. Help articles are read;
 * qualification protocols are executed, printed and signed, and a customer's
 * auditor should never find them mixed into product help. Separate roots also
 * keep protocols out of publish-public-docs.mjs, which syndicates only
 * content/help to the marketing site.
 *
 * The MiniSearch index is built once at module load. Import this only from
 * validation components so the bundle code-splits away from the app shell.
 */

const articles = validationData.articles ?? []
const categories = validationData.categories ?? []

const articlesBySlug = new Map(articles.map((a) => [a.slug, a]))
const categoryByDir = new Map(categories.map((c) => [c.dir, c]))

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

export function useValidationContent() {
  function search(query) {
    const q = (query ?? '').trim()
    if (!q) return []
    return mini.search(q)
  }

  function getArticle(slug) {
    return articlesBySlug.get(slug) ?? null
  }

  /**
   * Documents grouped into ordered categories for the index page:
   *   [{ dir, label, order, section, articles: [...] }]
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
        articles: list.slice().sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  }

  return { articles, categories, search, getArticle, grouped, categoryLabel }
}
