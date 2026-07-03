import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * Read-only sync-log entry for the integration health dashboard. Written by the
 * worker; the SPA lists it (pending/failed/dead) and offers replay. Liveness is
 * driven by a sync_broadcast job (this table is not audited).
 */
@ClientModel('integrationSyncEvents', { primaryKey: 'id', syncField: 'updatedAt', customIndex: 'companyId, status' })
export class IntegrationSyncEvent extends BaseModel {
  @Property({ type: String, required: true }) id = ''
  @Property({ type: String }) companyId = ''
  @Property({ type: String }) connectionId = ''
  @Property({ type: String }) provider = ''
  @Property({ type: String }) direction = ''
  @Property({ type: String }) entityType = ''
  @Property({ type: String }) localId = ''
  @Property({ type: String }) externalId = ''
  @Property({ type: String }) operation = ''
  @Property({ type: String }) status = 'PENDING'
  @Property({ type: Number }) attempts = 0
  @Property({ type: String }) error = ''
  @Property({ type: DateTime }) processedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
