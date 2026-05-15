import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('capaEffectivenessChecks', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'capaId, taskInstanceId',
})
export class CapaEffectivenessCheck extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || ''
    if (!this.updatedBy) this.updatedBy = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) capaId = ''
  @Property({ type: DateTime, required: true }) dueAt = /** @type {DateTime} */ (null)
  @Property({ type: String, required: true }) statusId = 'PENDING'
  @Property({ type: String }) taskInstanceId = /** @type {String} */ (null)
  @Property({ type: String }) parentCheckId = /** @type {String} */ (null)
  @Property({ type: String }) comments = ''
  @Property({ type: DateTime }) completedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) completedBy = /** @type {String} */ (null)
  @Property({ type: String, required: true }) createdBy = ''
  @Property({ type: String, required: true }) updatedBy = ''
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
