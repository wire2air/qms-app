/**
 * Link rewriting for Internal Docs markdown (docs/modules corpus).
 *
 * The corpus links between files with relative paths (`00-inventory.md`,
 * `../documents.md`) and sometimes reaches outside docs/modules entirely
 * (`../../backend/...`). Before rendering we rewrite targets so that:
 *   - in-corpus links become SPA routes (`/docs/<id>`), anchors preserved
 *   - out-of-tree repo links become GitHub blob URLs (they can't render in-app)
 *   - absolute http(s), mailto and pure-anchor links pass through untouched
 */
const GITHUB_REPO_BASE = 'https://github.com/wire2air/qms/blob/develop/'

/**
 * Resolve `target` against `baseDir` (posix segments, '' = docs/modules root).
 * Returns segments; leading '..' segments survive (they escape the corpus).
 */
function resolveSegments(baseDir, target) {
  const out = baseDir ? baseDir.split('/') : []
  for (const seg of target.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else out.push('..')
    } else {
      out.push(seg)
    }
  }
  return out
}

/**
 * Rewrite all markdown link targets of `markdown` for the doc `docId`
 * (`capa/07-state-machine` → baseDir `capa`; flat `workflows` → baseDir '').
 */
export function rewriteDocLinks(markdown, docId) {
  const baseDir = docId.includes('/') ? docId.slice(0, docId.lastIndexOf('/')) : ''

  return markdown.replace(/\]\(([^()\s]+)\)/g, (match, target) => {
    if (/^(https?:|mailto:|#|\/)/i.test(target)) return match

    const [pathPart, anchor] = target.split('#')
    if (!/\.md$/i.test(pathPart)) return match

    const segments = resolveSegments(baseDir, pathPart)
    const escapes = segments[0] === '..'

    if (!escapes) {
      // README.md is the pack home — route to the pack, not a doc id.
      const id = segments.join('/').replace(/\.md$/i, '')
      const packHome = id.endsWith('/README') ? id.slice(0, -'/README'.length) : id
      return `](/docs/${packHome}${anchor ? `#${anchor}` : ''})`
    }

    // Outside docs/modules — resolve repo-relative from the doc's own directory
    // and link to GitHub. Paths that would escape the repo root are left alone.
    const repoBase = baseDir ? `docs/modules/${baseDir}` : 'docs/modules'
    const repoSegments = resolveSegments(repoBase, pathPart)
    if (repoSegments[0] === '..') return match
    return `](${GITHUB_REPO_BASE}${repoSegments.join('/')}${anchor ? `#${anchor}` : ''})`
  })
}
