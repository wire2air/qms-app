import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('ncDispositionTypes', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, [companyId+code]',
})
export class NcDispositionType extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  // SCREAMING_SNAKE_CASE slug, unique per company. Stable identifier
  // that reports / integrations key off; the human-visible name is
  // editable but code is not.
  @Property({ type: String, required: true }) code = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  @Property({ type: Number }) displayOrder = 1000
  // Whether picking this disposition requires capturing Cost of NC and
  // gates the reviewer's Approve & Advance until cost is entered.
  @Property({ type: Boolean }) tracksCost = false
  // Adverse outcome (material not usable / needs action) vs accepting
  // (release, use-as-is, regrade). Drives the QC lot's terminal status,
  // the pass/fail notification group, and NC eligibility.
  @Property({ type: Boolean }) isAdverse = true
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
