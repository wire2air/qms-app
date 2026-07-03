import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('formTemplates', { primaryKey: 'id', syncField: 'updatedAt', customIndex: 'statusId' })
export class FormTemplate extends BaseModel {
  static paranoid = true
  constructor(...args) {
    super(...args)
    // Auto-assign companyId from current session on creation
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }

    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String }) title = ''
  @Property({ type: String, required: true }) code = ''
  @Property({ type: Array }) schema = /** @type {Array} */ ([])
  @Property({ type: String }) documentTypeId = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) statusId = 'DRAFT'
  @Property({ type: Number }) version = 1
  @Property({ type: Object }) config = null
  // --- generic-module definition (set when promoted to a module) ---
  @Property({ type: String }) internalName = ''
  @Property({ type: Boolean }) isModule = false
  @Property({ type: String }) icon = ''
  @Property({ type: Object }) moduleConfig = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
