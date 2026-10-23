import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * A knowledge base article's current state: the draft body (bodyMd, version)
 * and which version is live (publishedVersion). Read via the sync engine;
 * every write goes through /v1/services/kb, which writes a numbered version
 * per save (backend services/kbArticleService.js). Audience PUBLIC shows on
 * the help center; AGENTS only in the desk.
 */
@ClientModel('kbArticles', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'kbId',
  schemaVersion: 1,
})
export class KbArticle extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) kbId = ''
  @Property({ type: String }) collectionId = /** @type {String} */ (null)
  @Property({ type: String, required: true }) slug = ''
  @Property({ type: String }) locale = 'en'
  @Property({ type: String }) translationGroupId = /** @type {String} */ (null)
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) summary = /** @type {String} */ (null)
  @Property({ type: String }) bodyMd = ''
  @Property({ type: String }) audience = 'PUBLIC'
  @Property({ type: String }) status = 'DRAFT'
  @Property({ type: Number }) version = 0
  @Property({ type: Number }) publishedVersion = /** @type {Number} */ (null)
  @Property({ type: String }) currentRevisionId = /** @type {String} */ (null)
  @Property({ type: String }) publishedRevisionId = /** @type {String} */ (null)
  @Property({ type: String }) externalKey = /** @type {String} */ (null)
  @Property({ type: String }) source = 'UI'
  @Property({ type: Array }) tags = /** @type {string[]} */ ([])
  @Property({ type: Object }) seo = /** @type {Object} */ ({})
  @Property({ type: Number }) position = 0
  @Property({ type: String }) authorId = /** @type {String} */ (null)
  /** "Written by" on the help center (null = the author). */
  @Property({ type: String }) writtenById = /** @type {String} */ (null)
  /** "Article ID": a number for people (bigint, so a string over GraphQL). */
  @Property({ type: String }) number = /** @type {String} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) publishedAt = /** @type {DateTime} */ (null)
  /** Set the first time any version went live; never cleared. Such an article is archived, not deleted. */
  @Property({ type: DateTime }) firstPublishedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) publishedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)

  /** The draft has changes the live version doesn't. */
  get hasUnpublishedChanges() {
    return (
      this.status === 'PUBLISHED' &&
      this.publishedVersion != null &&
      this.version > this.publishedVersion
    )
  }
}
