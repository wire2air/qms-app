import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AuditFindingType — the global type vocabulary for audit findings
 * (observation, minor, major and so on).
 *
 * Global reference data, same shape and same reasoning as
 * AuditFindingStatus — see that file for why these two are mirrored at all.
 */
@ClientModel('auditFindingTypes', { primaryKey: 'id', syncField: 'updatedAt' })
export class AuditFindingType extends BaseModel {
  @Property({ type: String, required: true }) id = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  @Property({ type: Number }) displayOrder = 1000
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
