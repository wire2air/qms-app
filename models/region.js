import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// GLOBAL region lookup (NA / EU / APAC / LATAM / MEA) — migration-seeded with
// companyId NULL, visible to every tenant. Read-only in the UI.
@ClientModel('regions', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'code',
})
export class Region extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  // NULL for the global rows — do NOT default to the session company.
  @Property({ type: String }) companyId = /** @type {String} */ (null)
  @Property({ type: String, required: true }) code = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: Number }) displayOrder = 1000
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true }) createdAt = null
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true }) updatedAt = null
}
