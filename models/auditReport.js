import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AuditReport — an uploaded auditor report (PDF asset) registered against an
 * audit instance. Written through REST (upload + register); GraphQL reads.
 */
@ClientModel('auditReports', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, auditInstanceId',
})
export class AuditReport extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) auditInstanceId = ''
  @Property({ type: String, required: true }) assetId = ''
  @Property({ type: String, required: true }) title = ''
  /** INTERIM | FINAL */
  @Property({ type: String }) kind = 'INTERIM'
  @Property({ type: DateTime }) reportDate = /** @type {DateTime} */ (null)
  @Property({ type: String }) notes = /** @type {String} */ (null)
  @Property({ type: String, required: true }) uploadedBy = ''
  @Property({ type: DateTime }) aiParsedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
