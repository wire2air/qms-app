import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * RootCauseCategory — per-tenant taxonomy used to bucket finalized
 * root causes. Seeded at signup with the Fishbone 6Ms +
 * SYSTEM_PROCESS; tenants can rename or extend from Settings.
 *
 * NOT the same as the older global `ncRootCauseCategories` table —
 * that one is the NC payload's inline category dropdown; this one
 * backs the new normalized root_causes table for cross-record
 * reporting. They co-exist for now.
 */
@ClientModel('rootCauseCategories', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, [companyId+code]',
})
export class RootCauseCategory extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  // SCREAMING_SNAKE_CASE slug, unique per company. Stable identifier
  // that reports / integrations key off; the name is editable, the
  // code is not.
  @Property({ type: String, required: true }) code = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  // Hex string used by the FE badge styling. Null falls back to the
  // badge's default scheme.
  @Property({ type: String }) color = ''
  @Property({ type: Number }) displayOrder = 1000
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
