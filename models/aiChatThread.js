import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AI sidecar — a single conversation thread (see AI_PLAN.md §6).
 *
 * Threads are owned by the user who started them. The frontend reads from
 * IDB; new threads and the trailing last_message_at update flow back via
 * the audit→sync pipeline once the chat.turn task finishes a turn.
 */
@ClientModel('aiChatThreads', { primaryKey: 'id', syncField: 'updatedAt' })
export class AiChatThread extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.userId) {
      this.userId = currentSession.value?.userId || ''
    }
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }
    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) userId = ''
  @Property({ type: String }) title = ''
  @Property({ type: Object }) context = null
  @Property({ type: DateTime }) lastMessageAt = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
