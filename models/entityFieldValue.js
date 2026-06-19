import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * EntityFieldValue — custom-field DATA, one row per entity instance
 * (company, entityType, entityId). `payload` holds the DynamicForm answers;
 * `formSchema` is the seal snapshot of the set schema at save time (option
 * labels frozen), mirroring the nc_records.payload + workflow_instance_steps.
 * form_schema pattern. The entity reference is polymorphic — no relation.
 */
@ClientModel('entityFieldValues', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: '[entityType+entityId]',
})
export class EntityFieldValue extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || null
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) entityType = ''
  // The NC / CAPA / CR / Audit / Document / Training id. Polymorphic.
  @Property({ type: String, required: true }) entityId = ''
  @Property({ type: Object }) payload = /** @type {Object} */ ({})
  @Property({ type: Array }) formSchema = /** @type {Array} */ ([])
  @Property({ type: String }) createdBy = /** @type {String|null} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
