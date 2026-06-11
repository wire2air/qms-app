import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * LogBookType — catalog of log book categories. Globals (companyId = '')
 * ship as seeded rows (Daily / Calibration / PM / Cleaning / Equipment
 * / Production / Environmental / Safety / Quality); tenants can add
 * their own scoped to companyId.
 */
@ClientModel('logBookTypes', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, sequence',
})
export class LogBookType extends BaseModel {
  static paranoid = true

  @Property({ type: String, required: true }) id = ''
  @Property({ type: String }) companyId = '' // empty = global seed row
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  @Property({ type: Number }) sequence = 100

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
