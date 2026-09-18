import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * Uom — per-tenant Unit of Measure lookup for the Item Master (each / kg / L /
 * box …). Read-only via GraphQL/sync; mutated through the REST admin endpoints
 * (routes/uoms.js). A blank UOM on an item means "N/A".
 */
@ClientModel('uoms', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, [companyId+code]',
})
export class Uom extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) code = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  @Property({ type: Number }) displayOrder = 1000
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
