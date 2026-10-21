import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * A Support Desk knowledge base — one per support brand (backend
 * migrations/20261022100000-knowledge-base-core.js). Read via the sync engine;
 * WRITES go through /v1/services/kb (the service owns slugs and settings).
 */
@ClientModel('kbKnowledgeBases', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId',
  schemaVersion: 1,
})
export class KbKnowledgeBase extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) brandId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String, required: true }) slug = ''
  @Property({ type: String }) defaultLocale = 'en'
  @Property({ type: String }) status = 'DRAFT'
  @Property({ type: Object }) theme = /** @type {Object} */ ({})
  @Property({ type: Object }) themeSource = /** @type {Object} */ ({})
  @Property({ type: Object }) settings = /** @type {Object} */ ({})
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
