// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

/**
 * After a create page successfully mints a target row (NC, CAPA,
 * Training Instance, Change Request) from a `?findingId=` deep link,
 * call this helper to attach it as the finding's canonical spawned
 * record. Single round-trip, idempotent server-side (the link
 * endpoint upserts the spawned_*_id column).
 *
 * Best-effort — failures bubble up as a thrown error; callers should
 * catch + toast.warning so a transient link failure doesn't drop the
 * just-created target on the floor (the user can re-attach from the
 * audit page's link picker).
 *
 * @param {{ findingId: string, kind: 'NC'|'CAPA'|'TRAINING'|'CR', targetId: string }} args
 */
export async function linkSpawnedToFinding({ findingId, kind, targetId }) {
  if (!findingId || !kind || !targetId) return null
  return post(`/v1/services/auditFindings/${findingId}/link`, { kind, targetId })
}
