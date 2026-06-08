import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('changeRequestLinks', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'changeRequestId, [targetType+targetId]',
  schemaVersion: 1,
})
export class ChangeRequestLink extends BaseModel {
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
  @Property({ type: String, required: true }) changeRequestId = ''
  @Property({ type: String, required: true }) targetType = ''
  @Property({ type: String, required: true }) targetId = ''
  @Property({ type: String }) linkRole = 'AFFECTED'
  @Property({ type: String }) notes = ''
  @Property({ type: String, required: true }) createdBy = ''
  @Property({ type: DateTime, timestamp: true }) createdAt = null
  @Property({ type: DateTime, timestamp: true, autoUpdate: true }) updatedAt = null
  @Property({ type: DateTime }) deletedAt = null
}
