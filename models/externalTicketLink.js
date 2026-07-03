import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * Read-only mirror of a QMS complaint <-> external support-desk ticket link.
 * Written server-side (worker/api); the SPA reads it for the complaint detail
 * "Synced with …" rail card and the integration sync-health dashboard.
 */
@ClientModel('externalTicketLinks', { primaryKey: 'id', syncField: 'updatedAt', customIndex: 'complaintId, companyId' })
export class ExternalTicketLink extends BaseModel {
  static paranoid = true

  @Property({ type: String, required: true }) id = ''
  @Property({ type: String }) companyId = ''
  @Property({ type: String }) connectionId = ''
  @Property({ type: String }) provider = ''
  @Property({ type: String }) complaintId = ''
  @Property({ type: String }) externalId = ''
  @Property({ type: String }) externalUrl = ''
  @Property({ type: String }) externalStatus = ''
  @Property({ type: String }) externalVersion = ''
  @Property({ type: DateTime }) lastInboundAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) lastOutboundAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) syncState = 'LINKED'
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
