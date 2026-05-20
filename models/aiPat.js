import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * Personal access token for the MCP server (AI sidecar — see
 * backend/ai/README.md, AI_PLAN.md §6.5 + §11).
 *
 * The frontend never writes this model directly — creates go through the
 * REST endpoint /v1/services/ai/pats which returns the raw token ONCE.
 * Revokes also go through REST (DELETE …/pats/:id), then the audit trigger
 * fires the sync event and IDB updates.
 */
@ClientModel('aiPats', { primaryKey: 'id', syncField: 'createdAt' })
export class AiPat extends BaseModel {
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
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String, required: true }) prefix = ''
  @Property({ type: DateTime }) lastUsedAt = null
  @Property({ type: DateTime }) expiresAt = null
  @Property({ type: DateTime }) revokedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
}
