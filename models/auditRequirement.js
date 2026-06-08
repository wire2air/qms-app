import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AuditRequirement — a single clause on a versioned audit standard.
 * Hierarchical via parentId. Hangs off AuditStandardVersion so each
 * version captures its own clause list independently.
 */
@ClientModel('auditRequirements', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, auditStandardVersionId, parentId',
})
export class AuditRequirement extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) auditStandardVersionId = ''
  @Property({ type: String }) parentId = ''
  @Property({ type: String, required: true }) clauseNumber = ''
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) question = ''
  @Property({ type: String }) departmentId = ''
  @Property({ type: String }) categoryId = ''
  @Property({ type: String }) description = ''
  @Property({ type: String }) guidance = ''
  @Property({ type: String }) expectedEvidence = ''
  @Property({ type: Number }) riskWeight = 1
  @Property({ type: Number }) displayOrder = 1000
  @Property({ type: Boolean }) active = true
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
