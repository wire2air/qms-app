import { marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * Single source of truth for rendering markdown / HTML to the DOM via v-html.
 *
 * Every v-html call site should go through `markdownToHtml` (markdown input)
 * or `sanitizeHtml` (already-HTML input). Don't inline DOMPurify configs in
 * components — that's how the strict / permissive configs drifted across the
 * AI dialogs in the first place.
 *
 * `allowImages` is the only legitimate per-caller knob: the AI chat path
 * doesn't trust the model to emit safe images, but PDF import (which embeds
 * data: URLs from extracted page images) and document print (which renders
 * already-stored section HTML) both need img/src to pass through.
 */

/**
 * Docusaurus-style admonitions (`:::note … :::`).
 *
 * The help content is authored in Docusaurus flavour and uses these heavily —
 * they were rendering as a literal ":::note" paragraph in the app, because
 * `marked` has no notion of the syntax. Everything the callouts were carrying
 * (the break-glass warning on SSO, the caveats on CAPA and NC) was landing as
 * noise in the middle of a sentence.
 *
 * Title is optional: `:::tip Do this first` overrides the default heading.
 */
const ADMONITIONS = {
  note: { label: 'Note', tone: 'note' },
  info: { label: 'Info', tone: 'note' },
  tip: { label: 'Tip', tone: 'tip' },
  warning: { label: 'Warning', tone: 'warning' },
  caution: { label: 'Caution', tone: 'warning' },
  danger: { label: 'Danger', tone: 'danger' },
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
}

marked.use({
  extensions: [
    {
      name: 'admonition',
      level: 'block',
      start(src) {
        return src.match(/^:::/m)?.index
      },
      tokenizer(src) {
        const match = /^:::([a-zA-Z]+)[ \t]*([^\n]*)\n([\s\S]*?)\n?:::[ \t]*(?:\n|$)/.exec(src)
        if (!match) return undefined
        const [raw, type, title, body] = match
        const kind = type.toLowerCase()
        // Unknown keyword: leave it to the normal parser rather than inventing
        // a callout for what may just be a line starting with colons.
        if (!ADMONITIONS[kind]) return undefined
        return {
          type: 'admonition',
          raw,
          kind,
          title: title.trim(),
          tokens: this.lexer.blockTokens(`${body.trim()}\n`, []),
        }
      },
      renderer(token) {
        const meta = ADMONITIONS[token.kind]
        const heading = escapeHtml(token.title || meta.label)
        return (
          `<div class="admonition admonition-${meta.tone}">` +
          `<p class="admonition-title">${heading}</p>` +
          `${this.parser.parse(token.tokens)}</div>`
        )
      },
    },
  ],
})

const BASE_ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'class', 'colspan', 'rowspan', 'align']
const IMAGE_ALLOWED_ATTR = ['src', 'alt']
const FORBID_TAGS = ['style', 'script', 'iframe', 'object', 'embed', 'form']

// Knowledge base articles embed videos from these hosts only (backend
// services/kbMarkdown.js KB_VIDEO_HOSTS); any other frame is dropped.
const VIDEO_HOSTS = new Set(['www.youtube-nocookie.com', 'player.vimeo.com', 'www.loom.com'])
const VIDEO_ATTR = ['src', 'allow', 'allowfullscreen', 'loading', 'referrerpolicy', 'title']

function keepOnlyVideoFrames(node) {
  if (node.nodeName !== 'IFRAME') return
  let host = ''
  try {
    host = new URL(node.getAttribute('src') || '').host
  } catch {
    host = ''
  }
  if (!VIDEO_HOSTS.has(host) || !/^https:/i.test(node.getAttribute('src') || ''))
    node.parentNode?.removeChild(node)
}

/**
 * `allowVideoEmbeds`: knowledge base HTML (in-app help) keeps its YouTube /
 * Vimeo / Loom frames; every other iframe is still removed.
 */
export function sanitizeHtml(html, { allowImages = false, allowVideoEmbeds = false } = {}) {
  if (!html) return ''
  const attrs = allowImages ? [...BASE_ALLOWED_ATTR, ...IMAGE_ALLOWED_ATTR] : BASE_ALLOWED_ATTR
  if (!allowVideoEmbeds) return DOMPurify.sanitize(html, { ALLOWED_ATTR: attrs, FORBID_TAGS })
  DOMPurify.addHook('afterSanitizeElements', keepOnlyVideoFrames)
  try {
    return DOMPurify.sanitize(html, {
      ALLOWED_ATTR: [...new Set([...attrs, ...VIDEO_ATTR, 'id', 'open', 'download'])],
      ADD_TAGS: ['iframe', 'details', 'summary'],
      FORBID_TAGS: FORBID_TAGS.filter((t) => t !== 'iframe'),
    })
  } finally {
    DOMPurify.removeHook('afterSanitizeElements')
  }
}

export function markdownToHtml(md, { breaks = false, allowImages = false } = {}) {
  if (!md) return ''
  return sanitizeHtml(marked.parse(md, { breaks, gfm: true }), { allowImages })
}
