import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * Per-tenant counter for AuditInstance numbering. Year-bucketed prefix
 * (AUD-YYYY) on the BE; this model just mirrors the row for sync
 * purposes. The FE never mutates a counter directly — minting happens
 * inside the generator task / future ad-hoc create endpoint under a
 * row lock.
 */
@ClientModel('auditCounters', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, prefix',
})
export class AuditCounter extends BaseModel {
  // Server-side schema is NOT paranoid. Mirror that on the FE so
  // soft-delete filters don't strip rows that were never deletable.
  static paranoid = false

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) prefix = ''
  @Property({ type: Number, required: true }) currentValue = 1
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
