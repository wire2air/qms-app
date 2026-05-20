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

const BASE_ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'class', 'colspan', 'rowspan', 'align']
const IMAGE_ALLOWED_ATTR = ['src', 'alt']
const FORBID_TAGS = ['style', 'script', 'iframe', 'object', 'embed', 'form']

export function sanitizeHtml(html, { allowImages = false } = {}) {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_ATTR: allowImages ? [...BASE_ALLOWED_ATTR, ...IMAGE_ALLOWED_ATTR] : BASE_ALLOWED_ATTR,
    FORBID_TAGS,
  })
}

export function markdownToHtml(md, { breaks = false, allowImages = false } = {}) {
  if (!md) return ''
  return sanitizeHtml(marked.parse(md, { breaks, gfm: true }), { allowImages })
}
