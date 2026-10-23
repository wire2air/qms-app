/**
 * KNOWLEDGE BASE MARKDOWN ⇄ EDITOR DOCUMENT
 *
 * An article is stored as MARKDOWN (kb_articles.body_md). That is the format
 * Claude and the API push, the format the AI reads, and what version history
 * compares. The editor is visual, so this module converts both ways:
 *
 *   mdToEditorHtml(md)   Markdown → HTML the TipTap schema parses (data-type nodes)
 *   docToMarkdown(json)  TipTap JSON → Markdown, in the dialect below
 *
 * THE DIALECT (the server renders the same: backend services/kbMarkdown.js)
 *
 *   :::tip Optional title          callout: note info tip warning caution danger
 *   body
 *   :::
 *   :::details Section title       collapsible section
 *   body
 *   :::
 *   ::video{src="https://www.youtube.com/watch?v=…"}
 *   ::button[Contact support]{href="https://…"}
 *   ::file[Price list.pdf]{asset="<uuid>"}
 *   ![alt](kb-asset:<uuid>)        image of this knowledge base
 *   [text](kb-article:<uuid>#id)   link to another article (survives renames)
 *   {{dc.key}}                     dynamic content
 *
 * A container that holds another container uses more colons (::::details …
 * ::::), and is closed by exactly as many colons as opened it.
 */
import { Marked } from 'marked'

export const CALLOUT_KINDS = ['note', 'info', 'tip', 'warning', 'caution', 'danger']
export const CALLOUT_LABELS = {
  note: 'Note',
  info: 'Info',
  tip: 'Tip',
  warning: 'Warning',
  caution: 'Caution',
  danger: 'Danger',
}
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
export const DC_KEY_RE = /^[a-z0-9_]{1,64}$/

function escapeHtml(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

/** 'How to reset a password?' → 'how-to-reset-a-password' (the server's heading ids). */
export function headingSlug(text) {
  return (
    String(text || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z]+;|&#\d+;/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'section'
  )
}

/** The embeddable address of a YouTube, Vimeo or Loom link; null for anything else. */
export function kbVideoEmbedUrl(url) {
  let u
  try {
    u = new URL(String(url || '').trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.replace(/^www\.|^m\./, '')
  const id = (re, s) => (re.test(s || '') ? s : null)
  const YT = /^[A-Za-z0-9_-]{6,20}$/
  if (host === 'youtu.be') {
    const v = id(YT, u.pathname.slice(1).split('/')[0])
    return v ? `https://www.youtube-nocookie.com/embed/${v}` : null
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean)
    const v =
      parts[0] === 'watch'
        ? id(YT, u.searchParams.get('v'))
        : ['embed', 'shorts', 'live', 'v'].includes(parts[0])
          ? id(YT, parts[1])
          : null
    return v ? `https://www.youtube-nocookie.com/embed/${v}` : null
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const v = u.pathname
      .split('/')
      .filter(Boolean)
      .find((p) => /^\d{5,12}$/.test(p))
    return v ? `https://player.vimeo.com/video/${v}` : null
  }
  if (host === 'loom.com') {
    const parts = u.pathname.split('/').filter(Boolean)
    const v = ['share', 'embed'].includes(parts[0]) && /^[a-f0-9]{16,40}$/i.test(parts[1] || '')
    return v ? `https://www.loom.com/embed/${parts[1]}` : null
  }
  return null
}

// ── Markdown → editor HTML ───────────────────────────────────────────────────

function parseAttrs(s) {
  const out = {}
  for (const m of String(s || '').matchAll(/([a-zA-Z][\w-]*)="([^"]*)"/g)) out[m[1]] = m[2]
  return out
}
function unescapeLabel(s) {
  return String(s || '').replace(/\\([\\\]])/g, '$1')
}

function makeMarked() {
  const marked = new Marked({ gfm: true, breaks: false })
  marked.use({
    extensions: [
      {
        name: 'kbContainer',
        level: 'block',
        start(src) {
          return src.match(/^:{3,}[a-zA-Z]/m)?.index
        },
        tokenizer(src) {
          const open = /^(:{3,})([a-zA-Z]+)[ \t]*([^\n]*)(?:\n|$)/.exec(src)
          if (!open) return undefined
          const [, colons, rawName, title] = open
          const name = rawName.toLowerCase()
          if (name !== 'details' && !CALLOUT_KINDS.includes(name)) return undefined
          const rest = src.slice(open[0].length)
          const close = new RegExp(`(^|\\n)${colons}[ \\t]*(?:\\n|$)`).exec(rest)
          const body = close ? rest.slice(0, close.index) : rest
          const raw = open[0] + (close ? rest.slice(0, close.index + close[0].length) : rest)
          return {
            type: 'kbContainer',
            raw,
            name,
            title: title.trim(),
            tokens: this.lexer.blockTokens(`${body}\n`, []),
          }
        },
        renderer(token) {
          const inner = this.parser.parse(token.tokens)
          if (token.name === 'details')
            return `<div data-type="kb-details" data-title="${escapeHtml(token.title)}">${inner || '<p></p>'}</div>`
          return `<div data-type="kb-callout" data-kind="${token.name}" data-title="${escapeHtml(token.title)}">${inner || '<p></p>'}</div>`
        },
      },
      {
        name: 'kbLeaf',
        level: 'block',
        start(src) {
          return src.match(/^::(video|button|file)\b/m)?.index
        },
        tokenizer(src) {
          const m =
            /^::(video|button|file)(?:\[((?:\\.|[^\]\\\n])*)\])?\{([^}\n]*)\}[ \t]*(?:\n|$)/.exec(
              src,
            )
          if (!m) return undefined
          return {
            type: 'kbLeaf',
            raw: m[0],
            name: m[1],
            label: unescapeLabel(m[2]),
            attrs: parseAttrs(m[3]),
          }
        },
        renderer(t) {
          if (t.name === 'video')
            return `<div data-type="kb-video" data-src="${escapeHtml(t.attrs.src || '')}"></div>`
          if (t.name === 'button')
            return `<div data-type="kb-button" data-label="${escapeHtml(t.label)}" data-href="${escapeHtml(t.attrs.href || '')}"></div>`
          return `<div data-type="kb-file" data-asset="${escapeHtml(t.attrs.asset || '')}" data-name="${escapeHtml(t.label)}"></div>`
        },
      },
      {
        name: 'kbDc',
        level: 'inline',
        start(src) {
          return src.indexOf('{{dc.')
        },
        tokenizer(src) {
          const m = /^\{\{dc\.([a-z0-9_]{1,64})\}\}/.exec(src)
          return m ? { type: 'kbDc', raw: m[0], key: m[1] } : undefined
        },
        renderer(t) {
          return `<span data-type="kb-dc" data-key="${t.key}"></span>`
        },
      },
    ],
  })
  return marked
}

/** The article's Markdown as HTML for the editor to parse. */
export function mdToEditorHtml(md) {
  if (!String(md || '').trim()) return ''
  return makeMarked().parse(String(md))
}

// ── Editor document → Markdown ───────────────────────────────────────────────

const MARK_ORDER = ['link', 'bold', 'italic', 'strike', 'code']
const MARK_OPEN = { bold: '**', italic: '_', strike: '~~' }

function escapeText(s, { inTable = false } = {}) {
  let out = String(s)
    .replace(/\\/g, '\\\\')
    .replace(/&(?=#?[a-zA-Z0-9]+;)/g, '&amp;')
    .replace(/([*_`[\]<])/g, '\\$1')
    .replace(/\{\{/g, '\\{{')
    .replace(/~~/g, '\\~\\~')
  if (inTable) out = out.replace(/\|/g, '\\|')
  return out
}
/** Markdown that would turn a paragraph's first characters into a block. */
function escapeLineStart(line) {
  return line
    .replace(/^(\s*)(#{1,6}\s)/, '$1\\$2')
    .replace(/^(\s*)([-+]\s)/, '$1\\$2')
    .replace(/^(\s*)(\d+)([.)]\s)/, '$1$2\\$3')
    .replace(/^(\s*)(>)/, '$1\\$2')
    .replace(/^(\s*):(:+)/, '$1&#58;$2')
    .replace(/^(\s*)(={3,}|-{3,}|\*{3,})\s*$/, '$1\\$2')
}
function codeSpan(text) {
  const runs = String(text).match(/`+/g) || []
  const n = runs.reduce((m, r) => Math.max(m, r.length), 0) + 1
  const fence = '`'.repeat(n)
  const pad = /^`|`$/.test(text) || /^ .* $/.test(text) ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}
function attr(v) {
  return String(v ?? '').replace(/"/g, '%22')
}
function label(v) {
  return String(v ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/([\\\]])/g, '\\$1')
}
function linkHref(href) {
  const h = String(href || '').trim()
  return /[\s()<>]/.test(h) ? `<${h.replace(/[<>]/g, encodeURIComponent)}>` : h
}

function sameMark(a, b) {
  return a.type === b.type && (a.type !== 'link' || a.attrs?.href === b.attrs?.href)
}

/** Inline content (text with marks, hard breaks, images, dynamic content). */
function inlineToMd(nodes = [], ctx = {}) {
  let out = ''
  let stack = []
  function closeTo(n) {
    // Spaces just before a closing mark go after it (`**a** b`, not `**a **b`).
    if (stack.length <= n) return
    const trail = /[ \t]+$/.exec(out)?.[0] || ''
    if (trail) out = out.slice(0, -trail.length)
    while (stack.length > n) {
      const m = stack.pop()
      if (m.type === 'link') out += `](${linkHref(m.attrs?.href)})`
      else if (m.type !== 'code') out += MARK_OPEN[m.type] || ''
    }
    out += trail
  }
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      closeTo(0)
      out += ctx.inTable ? '<br>' : '\\\n'
      continue
    }
    if (node.type === 'kbDc') {
      closeTo(0)
      out += `{{dc.${node.attrs?.key}}}`
      continue
    }
    if (node.type === 'image') {
      closeTo(0)
      out += imageMd(node)
      continue
    }
    if (node.type !== 'text') continue
    const marks = [...(node.marks || [])]
      .filter((m) => MARK_ORDER.includes(m.type))
      .sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type))
    let keep = 0
    while (keep < stack.length && keep < marks.length && sameMark(stack[keep], marks[keep])) keep++
    closeTo(keep)
    const code = marks.some((m) => m.type === 'code')
    let text = node.text || ''
    if (code) {
      for (const m of marks.slice(keep)) {
        if (m.type === 'link') out += '['
        else if (m.type !== 'code') out += MARK_OPEN[m.type]
        stack.push(m)
      }
      out += codeSpan(text)
      continue
    }
    // Spaces just after an opening mark go before it.
    const lead = marks.length > keep ? /^[ \t]+/.exec(text)?.[0] || '' : ''
    if (lead) {
      out += lead
      text = text.slice(lead.length)
    }
    for (const m of marks.slice(keep)) {
      out += m.type === 'link' ? '[' : MARK_OPEN[m.type]
      stack.push(m)
    }
    out += escapeText(text, ctx)
  }
  closeTo(0)
  stack = []
  return out
}

function imageMd(node) {
  const a = node.attrs || {}
  const title = a.title ? ` "${String(a.title).replace(/"/g, '\\"')}"` : ''
  return `![${label(a.alt || '')}](${linkHref(a.src)}${title})`
}

function indent(text, prefix) {
  return text
    .split('\n')
    .map((l) => (l ? prefix + l : l))
    .join('\n')
}

/** How many colons a container needs: one more than the deepest container inside it. */
function containerDepth(node) {
  let d = 0
  for (const c of node.content || []) d = Math.max(d, containerDepth(c))
  return ['kbCallout', 'kbDetails'].includes(node.type) ? d + 1 : d
}

function listToMd(node, ordered) {
  const start = ordered ? Number(node.attrs?.start || 1) : 1
  const items = node.content || []
  const loose = items.some(
    (it) =>
      (it.content || []).filter((c) => c.type !== 'bulletList' && c.type !== 'orderedList').length >
      1,
  )
  return items
    .map((it, i) => {
      const marker = ordered ? `${start + i}. ` : '- '
      const body = blocksToMd(it.content || [], { tight: !loose })
      const pad = ' '.repeat(marker.length)
      const [first, ...rest] = body.split('\n')
      return marker + first + (rest.length ? '\n' + indent(rest.join('\n'), pad) : '')
    })
    .join(loose ? '\n\n' : '\n')
}

function tableToMd(node) {
  const rows = (node.content || []).map((row) =>
    (row.content || []).map((cell) =>
      (cell.content || [])
        .map((p) => (p.type === 'paragraph' ? inlineToMd(p.content, { inTable: true }) : ''))
        .filter(Boolean)
        .join('<br>')
        .trim(),
    ),
  )
  if (!rows.length) return ''
  const cols = Math.max(...rows.map((r) => r.length))
  const fill = (r) => [...r, ...Array(cols - r.length).fill('')]
  const line = (r) => `| ${fill(r).join(' | ')} |`
  return [
    line(rows[0]),
    `| ${Array(cols).fill('---').join(' | ')} |`,
    ...rows.slice(1).map(line),
  ].join('\n')
}

function blockToMd(node) {
  const a = node.attrs || {}
  switch (node.type) {
    case 'paragraph': {
      const text = inlineToMd(node.content)
        .replace(/^[ \t]+/, '')
        .replace(/[ \t]+$/gm, (m, off, all) => (all[off - 1] === '\\' ? m : ''))
      return text
        .split('\n')
        .map((l, i, all) => (i === 0 || all[i - 1].endsWith('\\') ? escapeLineStart(l) : l))
        .join('\n')
    }
    case 'heading':
      return `${'#'.repeat(Math.min(6, Math.max(2, a.level || 2)))} ${inlineToMd(node.content)}`
    case 'bulletList':
      return listToMd(node, false)
    case 'orderedList':
      return listToMd(node, true)
    case 'blockquote':
      return indent(blocksToMd(node.content || []), '> ').replace(/^$/gm, '>')
    case 'codeBlock': {
      const text = (node.content || [])
        .map((t) => t.text || '')
        .join('')
        .replace(/\n$/, '')
      const runs = text.match(/`{3,}/g) || []
      const fence = '`'.repeat(Math.max(3, ...runs.map((r) => r.length + 1)))
      return `${fence}${a.language || ''}\n${text}\n${fence}`
    }
    case 'horizontalRule':
      return '---'
    case 'image':
      return imageMd(node)
    case 'table':
      return tableToMd(node)
    case 'kbCallout':
    case 'kbDetails': {
      const colons = ':'.repeat(2 + containerDepth(node))
      const name =
        node.type === 'kbDetails' ? 'details' : CALLOUT_KINDS.includes(a.kind) ? a.kind : 'note'
      const title = String(a.title || '')
        .replace(/[\r\n]+/g, ' ')
        .trim()
      const body = blocksToMd(node.content || [])
      return `${colons}${name}${title ? ` ${title}` : ''}\n${body}\n${colons}`
    }
    case 'kbVideo':
      return `::video{src="${attr(a.src)}"}`
    case 'kbButton':
      return `::button[${label(a.label)}]{href="${attr(a.href)}"}`
    case 'kbFile':
      return `::file[${label(a.name)}]{asset="${attr(a.asset)}"}`
    default:
      return node.content ? blocksToMd(node.content) : ''
  }
}

function blocksToMd(nodes, { tight = false } = {}) {
  const parts = []
  for (const n of nodes) {
    const md = blockToMd(n)
    // An empty paragraph between blocks is spacing in the editor, not content.
    if (n.type === 'paragraph' && !md.trim()) continue
    parts.push(md)
  }
  return parts.join(tight ? '\n' : '\n\n')
}

/** The editor's document (editor.getJSON()) as article Markdown. */
export function docToMarkdown(doc) {
  const md = blocksToMd(doc?.content || [])
  return md ? `${md.replace(/\s+$/, '')}\n` : ''
}

// ── References ───────────────────────────────────────────────────────────────

export function kbArticleHref(articleId, anchor = '') {
  return `kb-article:${articleId}${anchor ? `#${anchor}` : ''}`
}
export function parseKbArticleHref(href) {
  const m = new RegExp(`^kb-article:(${UUID})(?:#(.*))?$`, 'i').exec(String(href || ''))
  return m ? { articleId: m[1].toLowerCase(), anchor: m[2] || '' } : null
}
export function parseKbAssetRef(src) {
  const m = new RegExp(`^kb-asset:(${UUID})$`, 'i').exec(String(src || ''))
  return m ? m[1].toLowerCase() : null
}

/** The headings of a document with the ids the server gives them: [{ id, text, level }]. */
export function docHeadings(doc) {
  const seen = new Map()
  const out = []
  function text(n) {
    return n.text || (n.content || []).map(text).join('')
  }
  function walk(n) {
    if (n.type === 'heading') {
      const t = text(n)
      const base = headingSlug(t)
      const k = (seen.get(base) || 0) + 1
      seen.set(base, k)
      out.push({ id: k === 1 ? base : `${base}-${k}`, text: t, level: n.attrs?.level || 2 })
    }
    for (const c of n.content || []) walk(c)
  }
  walk(doc || {})
  return out
}
