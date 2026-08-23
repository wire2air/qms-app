const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
])

const MAX_FILE_BYTES = 25 * 1024 * 1024

/**
 * Turn a `data:image/...;base64,...` src into a File, or null.
 *
 * Pasting a SCREENSHOT gives a clipboard file and uploads. Pasting HTML that
 * CONTAINS an image — from Word, or a copied region of a web page — does not:
 * the markup arrives with the bytes inlined as a data URI, which then sits in
 * a TEXT column and in the search index, megabytes at a time.
 *
 * Converting it back to a File lets the same uploader handle both, so an image
 * in the editor is an asset however it arrived.
 *
 * Returns null rather than throwing for anything malformed: a paste that
 * cannot be converted must still paste, just without the upgrade.
 */
export function dataUriToFile(dataUri, name = 'pasted-image') {
  if (typeof dataUri !== 'string') return null
  const match = dataUri.match(/^data:(image\/[a-z0-9+.-]+);base64,(.*)$/i)
  if (!match) return null

  const [, mime, base64] = match
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    const ext = mime.split('/')[1]?.split('+')[0] || 'png'
    return new File([bytes], `${name}.${ext}`, { type: mime })
  } catch {
    // Truncated or non-base64 payload. Nothing to upload; leave the paste be.
    return null
  }
}

export function isValidImageFile(file) {
  if (!file) return false
  if (!ALLOWED_MIME.has(file.type)) return false
  if (file.size > MAX_FILE_BYTES) return false
  return true
}

// Block known-dangerous schemes; allow everything else. Original strict
// whitelist (http/https, data:image, leading-slash relative) was rejecting
// legitimate upload URLs (protocol-relative `//cdn…`, `blob:`, signed S3 URLs
// with unusual schemes) and silently dropping `src` to null, which is why
// uploaded images failed to render. Exclusion-based sanitization is the
// pattern used by DOMPurify and most modern HTML sanitizers.
//
// What we still block:
//   - javascript:, vbscript: → XSS via src
//   - file:                  → local-disk read
//   - data:* where the MIME type isn't an image → e.g. data:text/html (XSS)
//
// Everything else (http, https, blob, relative paths, protocol-relative,
// data:image/*) is passed through unchanged.
export function sanitizeImageUrl(url) {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null

  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase()
    if (scheme === 'javascript' || scheme === 'vbscript' || scheme === 'file') {
      return null
    }
    if (scheme === 'data') {
      // Only image-MIME data URLs — never data:text/html or similar.
      if (!/^data:image\/[a-z0-9+.-]+[;,]/i.test(trimmed)) return null
    }
  }

  return trimmed
}

let uid = 0
export function nextUploadId() {
  return `up_${Date.now()}_${++uid}`
}

export const IMAGE_ALIGNMENTS = ['left', 'center', 'right', 'full']

export function normalizeAlignment(value) {
  return IMAGE_ALIGNMENTS.includes(value) ? value : 'center'
}
