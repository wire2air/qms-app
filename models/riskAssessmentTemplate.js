import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('riskAssessmentTemplates', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  loadStrategy: 'instant',
})
export class RiskAssessmentTemplate extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
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
  @Property({ type: DateTime, required: true, timestamp: true }) createdAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true }) updatedAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
