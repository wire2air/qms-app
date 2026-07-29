/**
 * Internal Docs Center endpoints — the platform-operator documentation browser
 * over qms/docs/modules. All reads; gated server-side by
 * requirePlatformAdmin('readonly').
 */
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get } from '@/api'

export function fetchDocsManifest() {
  return get('/v1/platform/docs/manifest', { loader: false })
}

export function fetchDocsSearchIndex() {
  return get('/v1/platform/docs/search-index', { loader: false })
}

export function fetchDocContent(id) {
  return get('/v1/platform/docs/content', { params: { id }, loader: false })
}
