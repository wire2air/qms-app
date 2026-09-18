import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('rcaTemplates', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  loadStrategy: 'instant',
})
export class RcaTemplate extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }
    // Stamp the creator so the "Own" access scope can be enforced by RLS
    // (owner_col = created_by). Without this the row's owner is NULL and an
    // Own-scoped user could neither see nor create their own templates.
    if (!this.createdBy) {
      this.createdBy = currentSession.value?.userId || null
    }
    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = null
  @Property({ type: Object }) config = {}
  @Property({ type: String }) createdBy = null
  @Property({ type: DateTime, required: true, timestamp: true }) createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true }) updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
