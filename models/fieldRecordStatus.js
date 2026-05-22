import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * Lifecycle statuses for FieldRecord. Read-only enum table — seeded by
 * the create-table migration. Used by status badges + queue filters.
 */
@ClientModel('fieldRecordStatuses', { primaryKey: 'id', syncField: 'updatedAt' })
export class FieldRecordStatus extends BaseModel {
  @Property({ type: String, required: true }) id = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  @Property({ type: Number }) sequence = 0
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
