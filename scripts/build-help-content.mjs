#!/usr/bin/env node
/**
 * Build the in-app Help Center content bundle.
 *
 * Reads the canonical Markdown under `content/help/**` (single source of truth),
 * parses frontmatter, rewrites intra-doc links to in-app `/help/<slug>` form, and
 * emits `src/content/help.generated.json` — a self-contained bundle the frontend
 * imports and indexes (MiniSearch) for the Help Center. Runs on predev/prebuild.
 *
 * Output shape:
 *   { generatedAt, articles: [{ slug, section, category, title, description,
 *     keywords, access, order, body }], categories: [{ dir, section, label, order }] }
 *
 * `access` (frontmatter, default 'registered') only gates the PUBLIC website
 * (see publish-public-docs.mjs); the in-app Help Center shows every article to
 * any logged-in user.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT_DIR = join(ROOT, 'content', 'help')
const OUT_FILE = join(ROOT, 'src', 'content', 'help.generated.json')

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (name.endsWith('.md') || name.endsWith('.mdx')) out.push(full)
  }
  return out
}

// `content/help/KB/quality/capas.md` -> `KB/quality/capas`
function toSlug(file) {
  return relative(CONTENT_DIR, file).replace(/\\/g, '/').replace(/\.mdx?$/, '')
}

/**
 * Rewrite an intra-doc Markdown link target to the in-app `/help/<slug>` form.
 * Leaves external (http, mailto, anchors) untouched. Handles `./` `../` relative
 * targets, root-relative doc ids (`KB/overview`), `.md` suffixes, and `#anchor`.
 */
function rewriteTarget(target, fromDir) {
  if (/^(https?:|mailto:|tel:|#)/i.test(target)) return target
  const [pathPart, hash] = target.split('#')
  let p = pathPart.replace(/\.mdx?$/, '')
  if (p.startsWith('./') || p.startsWith('../')) {
    // resolve relative to the current file's directory (posix), strip leading ./
    p = posix.normalize(posix.join(fromDir, p)).replace(/^\.\//, '')
  }
  p = p.replace(/^\//, '') // tolerate a leading slash
  return `/help/${p}${hash ? `#${hash}` : ''}`
}

function rewriteLinks(body, slug) {
  const fromDir = posix.dirname(slug) // e.g. 'KB/ai' (or '.' for top-level)
  return body.replace(/\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (_m, target, title = '') => {
    return `](${rewriteTarget(target, fromDir === '.' ? '' : fromDir)}${title})`
  })
}

// Docusaurus _category_.json -> { label, position }
function loadCategories() {
  const cats = []
  function visit(dir) {
    const catFile = join(dir, '_category_.json')
    if (existsSync(catFile)) {
      const meta = JSON.parse(readFileSync(catFile, 'utf8'))
      const dirSlug = relative(CONTENT_DIR, dir).replace(/\\/g, '/')
      cats.push({
        dir: dirSlug,
        section: dirSlug.split('/')[0],
        label: meta.label || dirSlug.split('/').pop(),
        order: meta.position ?? 999,
      })
    }
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) visit(full)
    }
  }
  visit(CONTENT_DIR)
  return cats
}

function build() {
  if (!existsSync(CONTENT_DIR)) {
    console.error(`[help] content dir not found: ${CONTENT_DIR}`)
    process.exit(1)
  }
  const files = walk(CONTENT_DIR)
  const articles = files.map((file) => {
    const slug = toSlug(file)
    const { data, content } = matter(readFileSync(file, 'utf8'))
    return {
      slug,
      section: slug.split('/')[0],
      category: posix.dirname(slug) === '.' ? slug.split('/')[0] : posix.dirname(slug),
      title: data.title || slug,
      description: data.description || '',
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
      access: data.access === 'public' ? 'public' : 'registered',
      order: data.sidebar_position ?? 999,
      body: rewriteLinks(content.trim(), slug),
    }
  })
  articles.sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order)

  const payload = { generatedAt: new Date().toISOString(), articles, categories: loadCategories() }
  mkdirSync(dirname(OUT_FILE), { recursive: true })
  writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2))
  const pub = articles.filter((a) => a.access === 'public').length
  console.log(`[help] wrote ${articles.length} articles (${pub} public) -> ${relative(ROOT, OUT_FILE)}`)
}

build()
