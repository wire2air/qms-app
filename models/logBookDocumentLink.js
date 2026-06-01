import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * LogBookDocumentLink — many-to-many between log_books and documents.
 * "This log book IMPLEMENTS SOP-001." Audit module consumes these for
 * trace-from-doc-to-evidence lookups.
 */
@ClientModel('logBookDocumentLinks', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'logBookId, documentId',
})
export class LogBookDocumentLink extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    // createdBy is a nullable UUID column — must be a real id or null,
    // never '' (an empty string fails GraphQL UUID validation on insert).
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || null
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) logBookId = ''
  @Property({ type: String, required: true }) documentId = ''
  @Property({ type: String }) relationshipType = 'IMPLEMENTS'
  @Property({ type: String }) notes = ''
  @Property({ type: String }) createdBy = null

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
