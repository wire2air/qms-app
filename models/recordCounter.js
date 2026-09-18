import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('recordCounters', { primaryKey: 'templateId', syncField: 'updatedAt' })
export class RecordCounter extends BaseModel {
  static paranoid = true // Enable soft deletes using deletedAt field
  // The DB table's PRIMARY KEY is composite — (company_id, template_id) since the
  // records-numbering-by-template migration. PostGraphile's update/delete input
  // therefore requires BOTH columns; `keyFields` tells the MutationRunner to send
  // companyId alongside templateId (IndexedDB still keys on templateId alone —
  // one IDB per company). Without this, updating an existing counter failed with
  // "Field 'companyId' of required type 'UUID!' was not provided", which stalled
  // record numbering and caused duplicate record numbers.
  static keyFields = ['companyId', 'templateId']
  constructor(...args) {
    super(...args)
    // Auto-assign companyId from current session on creation
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }
  }
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) templateId = ''
  @Property({ type: Number }) currentValue = 1
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
