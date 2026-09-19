/**
 * Service accounts — machine identities that own API keys.
 *
 * These are NOT syncEngine entity CRUD, so per CLAUDE.md rule #4 they use the
 * axios helpers directly. Two reasons, both load-bearing:
 *
 *  1. The responses are DTOs, not model records. A service account is a `users`
 *     row on disk, but the API returns `{ id, name, description, statusId,
 *     roleIds }` — a deliberately narrow projection that never carries the
 *     password, PIN or lockout columns that live on that table. There is no
 *     record for `syncBus` to broadcast and nothing for IndexedDB to hold.
 *  2. Key issuance returns a SECRET exactly once. That can never be a synced
 *     record — writing it to IndexedDB would persist a credential to disk on
 *     every device the user has ever opened the app on.
 *
 * Every endpoint is gated server-side on `api_integrations:*`; the sidebar gate
 * is convenience only.
 */
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, post, patch, del } from '@/api'

// ── Accounts ─────────────────────────────────────────────────────────────────

export function listServiceAccounts() {
  return get('/v1/services/service-accounts', { loader: false })
}

export function getServiceAccount(id) {
  return get(`/v1/services/service-accounts/${id}`, { loader: false })
}

export function createServiceAccount(payload) {
  return post('/v1/services/service-accounts', payload, {
    showSuccess: 'Service account created',
  })
}

export function updateServiceAccount(id, payload) {
  return patch(`/v1/services/service-accounts/${id}`, payload, {
    showSuccess: 'Service account updated',
  })
}

export function setServiceAccountEnabled(id, enabled) {
  return post(
    `/v1/services/service-accounts/${id}/${enabled ? 'enable' : 'disable'}`,
    {},
    { showSuccess: enabled ? 'Service account enabled' : 'Service account disabled' },
  )
}

export function deleteServiceAccount(id) {
  return del(`/v1/services/service-accounts/${id}`, {
    showSuccess: 'Service account deleted',
  })
}

// ── Keys ─────────────────────────────────────────────────────────────────────

export function listServiceAccountKeys(id) {
  return get(`/v1/services/service-accounts/${id}/keys`, { loader: false })
}

/** Returns `{ key, secret }`. `secret` is shown once and never stored. */
export function issueServiceAccountKey(id, payload) {
  return post(`/v1/services/service-accounts/${id}/keys`, payload)
}

export function revokeServiceAccountKey(id, keyId) {
  return post(
    `/v1/services/service-accounts/${id}/keys/${keyId}/revoke`,
    {},
    { showSuccess: 'Key revoked' },
  )
}
