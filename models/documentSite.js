import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * DocumentSite — pivot between documents and sites: where the document
 * APPLIES (visibility). documents.siteId stays the OWNING site (write reach
 * + department pairing); a document with appliesAllSites = true needs no
 * rows here. Same shape as SiteOnLogBook.
 */
@ClientModel('documentSites', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'documentId, siteId',
})
export class DocumentSite extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) documentId = ''
  @Property({ type: String, required: true }) siteId = ''

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
