import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// Per-tenant Severity lookup (rank + color for the badge).
@ClientModel('complaintSeverities', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, [companyId+code]',
})
export class ComplaintSeverity extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) code = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  @Property({ type: Number }) rank = /** @type {Number} */ (null)
  @Property({ type: String }) color = ''
  @Property({ type: Number }) displayOrder = 1000
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true }) createdAt = null
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true }) updatedAt = null
}
