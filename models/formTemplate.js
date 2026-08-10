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
  // FORM = standalone template (own records); BLOCK = reusable form fragment
  // embedded in workflow step forms / checklists.
  @Property({ type: String }) kind = 'FORM'
  // BLOCK sub-category: 'GENERAL' (task-form / QC fragment) | 'LOG_FORM'
  // (log-book template, exclusive to the log-book flow). Ignored for FORM.
  @Property({ type: String }) blockCategory = 'GENERAL'
  // --- generic-module definition (set when promoted to a module) ---
  // NULL unless this template is a promoted module. Must NOT default to ''
  // — form_templates_internal_name_company_uidx is UNIQUE on
  // (company_id, internal_name) WHERE internal_name IS NOT NULL, so a second
  // row with '' collides. NULL is excluded from the index (only modules set it).
  @Property({ type: String }) internalName = null
  @Property({ type: Boolean }) isModule = false
  @Property({ type: String }) icon = ''
  @Property({ type: Object }) moduleConfig = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
