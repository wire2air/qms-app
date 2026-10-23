import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * Dynamic content of a knowledge base: a named value ({{dc.key}} in an
 * article) that every article shows as it is now. Writes: /v1/services/kb.
 */
@ClientModel('kbSnippets', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'kbId',
  schemaVersion: 1,
})
export class KbSnippet extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) kbId = ''
  @Property({ type: String, required: true }) key = ''
  @Property({ type: String, required: true }) title = ''
  @Property({ type: String }) value = ''
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
