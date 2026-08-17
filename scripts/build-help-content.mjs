#!/usr/bin/env node
/**
 * Build the in-app Markdown content bundles.
 *
 * Two bundles come out of one pipeline, because they are the same problem:
 * canonical Markdown on disk → parsed frontmatter → intra-doc links rewritten
 * to in-app routes → a self-contained JSON the frontend imports and indexes
 * (MiniSearch). Runs on predev/prebuild.
 *
 *   content/help/**       → src/content/help.generated.json        (/help/<slug>)
 *   content/validation/** → src/content/validation.generated.json  (/validation/<slug>)
 *
 * The validation bundle holds the customer-facing qualification package (VMP,
 * IQ, per-module OQ protocols, PQ templates, traceability, Part 11 assessment).
 * It is a separate content root, not a Help Center category, for two reasons:
 * those documents are executed and signed rather than read, and
 * publish-public-docs.mjs syndicates content/help to the marketing site —
 * keeping the roots apart means a protocol can never leak there by default.
 *
 * Output shape (both bundles):
 *   { generatedAt, articles: [{ slug, section, category, title, description,
 *     keywords, access, order, body }], categories: [{ dir, section, label, order }] }
 *
 * `access` (frontmatter, default 'registered') only gates the PUBLIC website
 * (see publish-public-docs.mjs); in-app, every logged-in user sees everything.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The bundles to build. Add a row to add a content root. */
const BUNDLES = [
  {
    name: 'help',
    contentDir: join(ROOT, 'content', 'help'),
    outFile: join(ROOT, 'src', 'content', 'help.generated.json'),
    routePrefix: '/help',
    required: true,
  },
  {
    name: 'validation',
    contentDir: join(ROOT, 'content', 'validation'),
    outFile: join(ROOT, 'src', 'content', 'validation.generated.json'),
    routePrefix: '/validation',
    // Optional so a checkout without the package still builds; an empty
    // bundle is emitted instead of failing the whole dev server.
    required: false,
  },
]

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
function toSlug(contentDir, file) {
  return relative(contentDir, file)
    .replace(/\\/g, '/')
    .replace(/\.mdx?$/, '')
}

/**
 * Rewrite an intra-doc Markdown link target to its in-app `<prefix>/<slug>` form.
 * Leaves external (http, mailto, anchors) untouched. Handles `./` `../` relative
 * targets, root-relative doc ids (`KB/overview`), `.md` suffixes, and `#anchor`.
 *
 * Idempotent: a target already written in final form (`/help/KB/overview`) is
 * returned unchanged. Without this the leading slash is stripped and the prefix
 * applied a second time, yielding `/help/help/KB/overview` — a dead link that
 * renders and clicks perfectly well, so it is only found by following it.
 */
function rewriteTarget(target, fromDir, routePrefix) {
  if (/^(https?:|mailto:|tel:|#)/i.test(target)) return target
  const [pathPart, hash] = target.split('#')
  let p = pathPart.replace(/\.mdx?$/, '')
  if (p === routePrefix || p.startsWith(`${routePrefix}/`)) return target
  if (p.startsWith('./') || p.startsWith('../')) {
    // resolve relative to the current file's directory (posix), strip leading ./
    p = posix.normalize(posix.join(fromDir, p)).replace(/^\.\//, '')
  }
  p = p.replace(/^\//, '') // tolerate a leading slash
  return `${routePrefix}/${p}${hash ? `#${hash}` : ''}`
}

function rewriteLinks(body, slug, routePrefix) {
  const fromDir = posix.dirname(slug) // e.g. 'KB/ai' (or '.' for top-level)
  return body.replace(/\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (_m, target, title = '') => {
    return `](${rewriteTarget(target, fromDir === '.' ? '' : fromDir, routePrefix)}${title})`
  })
}

// Docusaurus _category_.json -> { label, position }
function loadCategories(contentDir) {
  const cats = []
  function visit(dir) {
    const catFile = join(dir, '_category_.json')
    if (existsSync(catFile)) {
      const meta = JSON.parse(readFileSync(catFile, 'utf8'))
      const dirSlug = relative(contentDir, dir).replace(/\\/g, '/')
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
  visit(contentDir)
  return cats
}

function build({ name, contentDir, outFile, routePrefix, required }) {
  if (!existsSync(contentDir)) {
    if (required) {
      console.error(`[${name}] content dir not found: ${contentDir}`)
      process.exit(1)
    }
    mkdirSync(dirname(outFile), { recursive: true })
    writeFileSync(
      outFile,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), articles: [], categories: [] },
        null,
        2,
      ),
    )
    console.info(`[${name}] no content dir — wrote an empty bundle`)
    return
  }

  const files = walk(contentDir)
  const articles = files.map((file) => {
    const slug = toSlug(contentDir, file)
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
      body: rewriteLinks(content.trim(), slug, routePrefix),
    }
  })
  articles.sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order)

  const payload = {
    generatedAt: new Date().toISOString(),
    articles,
    categories: loadCategories(contentDir),
  }
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, JSON.stringify(payload, null, 2))
  const pub = articles.filter((a) => a.access === 'public').length
  console.info(
    `[${name}] wrote ${articles.length} articles (${pub} public) -> ${relative(ROOT, outFile)}`,
  )
}

for (const bundle of BUNDLES) build(bundle)
