import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('ncDispositionTypes', { primaryKey: 'id', syncField: 'updatedAt' })
export class NcDispositionType extends BaseModel {
  static paranoid = true

  @Property({ type: String, required: true }) id = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  @Property({ type: Number }) displayOrder = 1000
  // Whether picking this disposition requires capturing Cost of NC and
  // gates the reviewer's Approve & Advance until cost is entered.
  @Property({ type: Boolean }) tracksCost = false
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
