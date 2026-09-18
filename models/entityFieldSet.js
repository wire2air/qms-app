import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * EntityFieldSet — admin-defined custom-field DEFINITIONS, one row per
 * (company, entityType). `schema` is the FormBuilder schema array authored
 * under Settings → Custom Fields. Rendered by DynamicForm on the entity detail
 * page (CustomFieldsCard); sealed per-record into EntityFieldValue.formSchema.
 */
@ClientModel('entityFieldSets', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'entityType',
})
export class EntityFieldSet extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || null
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  // 'Nonconformance' | 'Capa' | 'ChangeRequest' | 'AuditInstance' | 'Document' | 'Training'
  @Property({ type: String, required: true }) entityType = ''
  // FormBuilder schema array.
  @Property({ type: Array }) schema = /** @type {Array} */ ([])
  @Property({ type: String }) createdBy = /** @type {String|null} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
