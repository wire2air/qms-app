import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * SharedWithUser — per-user grant of read access to a document, CAPA, or
 * NC.  Drives:
 *   - the "Shared with" panel on each detail page (manual shares)
 *   - the supplier dashboard's four lists (Shared Documents / CAPAs /
 *     NCs / Asset Requests) — RLS-filtered to live shares for the user
 *   - auto-share-on-workflow-assignment (a row with granted_via =
 *     'WORKFLOW_ASSIGNMENT' is created server-side when a supplier user
 *     is added to a workflow step)
 *
 * Soft-deletable: revoking + re-granting preserves the audit trail.
 */
@ClientModel('sharedWithUsers', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  // (entity_type, entity_id, user_id) is the hot-path lookup; companyId
  // covers the supplier dashboard's "what's shared with me" query.
  customIndex: '[entityType+entityId], userId, [userId+entityType], companyId',
})
export class SharedWithUser extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) userId = ''
  @Property({ type: String, required: true }) entityType = ''
  @Property({ type: String, required: true }) entityId = ''
  // 'MANUAL' | 'WORKFLOW_ASSIGNMENT' | 'REFERENCE' — a REFERENCE grant was
  // created automatically because a shared document cites this one.
  @Property({ type: String }) grantedVia = 'MANUAL'
  @Property({ type: String }) grantedBy = null
  // Set only on REFERENCE grants: the document whose share created this one.
  @Property({ type: String }) sourceEntityId = null
  @Property({ type: String }) notes = ''

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
