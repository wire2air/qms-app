import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// L5 — a role granted to a team (grants that role to every live team member).
// Mirrors RoleOnUser; grantedBy is stamped from the session for the audit story.
@ClientModel('rolesOnTeams', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: '[roleId+teamId], roleId, teamId',
})
export class RoleOnTeam extends BaseModel {
  static paranoid = true // Enable soft deletes using deletedAt field
  constructor(...args) {
    super(...args)
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }
    if (!this.grantedBy) {
      this.grantedBy = currentSession.value?.userId || null
    }
    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) teamId = ''
  @Property({ type: String, required: true }) roleId = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String }) grantedBy = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
