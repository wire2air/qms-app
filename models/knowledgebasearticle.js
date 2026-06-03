import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('knowledgeBaseArticles', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId',
  schemaVersion: 2,
})
export class KnowledgeBaseArticle extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }
    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) body = ''
  @Property({ type: String }) category = ''
  @Property({ type: Boolean }) isPublished = false
  @Property({ type: Number }) displayOrder = 0
  @Property({ type: String }) createdBy = ''
  @Property({ type: String }) updatedBy = ''
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
