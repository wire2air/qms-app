import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * LogBookType — catalog of log book categories. A standard per-tenant
 * lookup (UUID id + human `code`): every company gets the 9 defaults
 * seeded at onboarding (Daily / Calibration / PM / …) and owns its rows —
 * names and record-id prefixes are editable under Lookups → Log Book Types.
 */
@ClientModel('logBookTypes', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, sequence',
})
export class LogBookType extends BaseModel {
  static paranoid = true

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  // Stable human key, unique per company (DAILY, CALIBRATION, PM, …).
  @Property({ type: String, required: true }) code = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  // Record-id prefix {TYPECODE} resolves to when a log book's code is
  // minted (empty → falls back to the code).
  @Property({ type: String }) prefix = ''
  @Property({ type: Number }) sequence = 100

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
