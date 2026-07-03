import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * LogBook — Inspections & Logs native template. Replaces the practice
 * of stamping `recordClassification` onto form_templates rows. Each
 * LogBook owns its own schema + I&L policy + references.
 *
 * Created by migration 20260526000100-create-log-books-first-class.js
 * which also backfilled existing OPERATIONAL_LOG / CONTROLLED_RECORD
 * form_template rows into this table (same UUIDs preserved).
 */
@ClientModel('logBooks', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, logBookTypeId, supervisorUserId, statusId',
})
export class LogBook extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''

  @Property({ type: String, required: true }) code = ''
  @Property({ type: String }) codePrefix = 'FRM-{DEPTCODE}-{TYPECODE}'
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) description = ''

  // Taxonomy + routing
  @Property({ type: String }) logBookTypeId = ''
  // Owner drives the approval flow (submit / discard / new version).
  @Property({ type: String }) ownerUserId = ''
  @Property({ type: String }) supervisorUserId = ''

  // Equipment / department / free-text location references
  @Property({ type: String }) equipmentId = ''
  @Property({ type: String }) departmentId = ''
  @Property({ type: String }) location = ''

  // Compliance references — nullable UUID FK to the RelatedStandard lookup,
  // default null (not '') so an unset value never hits the UUID FK column.
  @Property({ type: String }) relatedStandardId = null
  @Property({ type: String }) regulatoryCitation = ''
  @Property({ type: Number }) retentionMonths = null

  // Policy
  @Property({ type: String, required: true }) recordClassification = 'OPERATIONAL_LOG'
  @Property({ type: String }) editWindowMode = 'TIME_WINDOW'
  @Property({ type: Number }) editWindowMinutes = null
  @Property({ type: Boolean }) signatureRequired = false
  @Property({ type: Boolean }) reviewRequired = false
  @Property({ type: String }) notifyOnSubmit = 'DIGEST'

  // Form definition
  @Property({ type: Array }) schema = /** @type {Array} */ ([])
  @Property({ type: Number }) schemaVersion = 1

  @Property({ type: String }) statusId = 'ACTIVE'
  @Property({ type: String }) createdBy = ''

  // Controlled-version pointers (source of truth is LogBookVersion).
  @Property({ type: String }) currentEffectiveVersionId = ''
  @Property({ type: String }) latestDraftVersionId = ''
  // Attached approval workflow (PUBLISHED workflow version).
  @Property({ type: String }) workflowVersionId = ''

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
