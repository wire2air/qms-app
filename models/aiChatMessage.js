import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AI sidecar — a single message in a chat thread (see AI_PLAN.md §6).
 *
 * Roles:
 *   'user'      — what the user typed; content has the text.
 *   'assistant' — model output; content has the text, tool_calls has the
 *                 raw Anthropic content-block array if the model called
 *                 tools (replayable).
 *   'tool'      — a single tool invocation result; tool_name, tool_use_id,
 *                 tool_result, is_error.
 *
 * Messages are immutable on the backend (beforeUpdate throws). The frontend
 * only inserts them via the chat.turn task — never directly.
 */
@ClientModel('aiChatMessages', { primaryKey: 'id', syncField: 'createdAt', customIndex: 'threadId' })
export class AiChatMessage extends BaseModel {
  constructor(...args) {
    super(...args)
    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) threadId = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) role = ''
  @Property({ type: String }) content = ''
  @Property({ type: Object }) toolCalls = null
  @Property({ type: String }) toolName = ''
  @Property({ type: String }) toolUseId = ''
  @Property({ type: Object }) toolResult = null
  @Property({ type: Boolean }) isError = false
  @Property({ type: String }) aiJobId = ''
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
}
