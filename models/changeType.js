import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('changeTypes', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  schemaVersion: 1,
})
export class ChangeType extends BaseModel {
  @Property({ type: String, required: true }) id = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  @Property({ type: Number }) displayOrder = 1000
  @Property({ type: Boolean }) riskAssessmentRequired = false
  @Property({ type: Boolean }) rcaRequired = false
  @Property({ type: DateTime, timestamp: true }) createdAt = null
  @Property({ type: DateTime, timestamp: true, autoUpdate: true }) updatedAt = null
}
