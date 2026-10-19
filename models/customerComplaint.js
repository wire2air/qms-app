import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('customerComplaints', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, statusId, assignedTo',
  schemaVersion: 5,
})
export class CustomerComplaint extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) {
      this.companyId = currentSession.value?.companyId || ''
    }
    if (!this.id) {
      this.id = crypto.randomUUID()
    }
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, excludeFromGraphQL: ['update'] }) complaintNumber = ''
  @Property({ type: String, required: true }) subject = ''
  @Property({ type: String }) description = ''
  // COMPLAINT-C1 (client half): status is server-enforced by the
  // enforce_customer_complaint_status_transition trigger; block the generated update
  // mutation from ever carrying statusId (status changes go through the REST complaint
  // actions: accept / assign / reply / resolve / hold / close / reopen).
  // ── Server-owned fields ─────────────────────────────────────────────────
  // Lifecycle, routing, chat, SLA, CSAT and spam state are written ONLY by
  // the API (action RPCs, the public chat API, the lifecycle job). They are
  // excluded from client UPDATE patches so an inline-edit autosave can never
  // push a stale copy over what the server just wrote (2026-10-19: a details
  // drawer save reverted chat_state ENDED → ACTIVE and the lifecycle job
  // happily re-seated an ended chat). Same precedent as statusId.
  @Property({ type: String, excludeFromGraphQL: ['update'] }) statusId = 'NEW'
  @Property({ type: String }) priorityId = /** @type {String} */ (null)
  @Property({ type: String }) sourceId = 'WEB'
  @Property({ type: String }) customerName = /** @type {String} */ (null)
  @Property({ type: String }) customerEmail = /** @type {String} */ (null)
  @Property({ type: String }) customerCompany = /** @type {String} */ (null)
  @Property({ type: String }) customerPhone = /** @type {String} */ (null)
  @Property({ type: String, excludeFromGraphQL: ['update'] }) assignedTo = /** @type {String} */ (
    null
  )
  // Group routing — teams ("groups" in the UI).
  @Property({ type: String }) assignedTeamId = /** @type {String} */ (null)
  // POSITIVE | NEUTRAL | NEGATIVE | URGENT (manual or routing rules).
  @Property({ type: String }) sentiment = /** @type {String} */ (null)
  // Spam tickets hide from the default list and stats.
  @Property({ type: Boolean, excludeFromGraphQL: ['update'] }) isSpam = false
  // ── Support Desk Phase 1 (spec §2.3) ──────────────────────────────────
  @Property({ type: String, excludeFromGraphQL: ['update'] }) brandId = /** @type {String} */ (null)
  // EMAIL | FORM | CHAT
  @Property({ type: String, excludeFromGraphQL: ['update'] }) channelKind = 'EMAIL'
  // Chat only: WAITING | ACTIVE | IDLE | ENDED
  @Property({ type: String, excludeFromGraphQL: ['update'] }) chatState = /** @type {String} */ (
    null
  )
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) snoozedUntil =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) lastAgentMessageAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) assignedAt =
    /** @type {DateTime} */ (null)
  @Property({ type: String, excludeFromGraphQL: ['update'] }) assignedBy = /** @type {String} */ (
    null
  )
  @Property({ type: String, excludeFromGraphQL: ['update'] }) takeoverOfUserId =
    /** @type {String} */ (null)
  // ── Phase 2: chat (spec §2.4 / §4.3) ──────────────────────────────────
  @Property({ type: String, excludeFromGraphQL: ['update'] }) visitorId = /** @type {String} */ (
    null
  )
  @Property({ type: String, excludeFromGraphQL: ['update'] }) outboundMessageId =
    /** @type {String} */ (null)
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) visitorLastSeenAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) lastCustomerReadAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) chatStartedAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) chatEndedAt =
    /** @type {DateTime} */ (null)
  @Property({ type: Object, excludeFromGraphQL: ['update'] }) chatFlags = /** @type {Object} */ ({})
  @Property({ type: String, excludeFromGraphQL: ['update'] }) spamMarkedBy = /** @type {String} */ (
    null
  )
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) spamMarkedAt =
    /** @type {DateTime} */ (null)
  // Requester linkage (customer layer) — history/trending.
  @Property({ type: String }) customerId = /** @type {String} */ (null)
  @Property({ type: String }) organizationId = /** @type {String} */ (null)
  // First public agent reply (response-time analytics + SLA).
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) firstResponseAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) slaFirstResponseDueAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) slaResolutionDueAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) slaNotifiedAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) lastRoutedAt =
    /** @type {DateTime} */ (null)
  @Property({ type: Number, excludeFromGraphQL: ['update'] }) csatRating = /** @type {Number} */ (
    null
  )
  @Property({ type: String, excludeFromGraphQL: ['update'] }) csatComment = /** @type {String} */ (
    null
  )
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) csatSubmittedAt =
    /** @type {DateTime} */ (null)
  // Email channel the ticket arrived on (null for web/manual tickets).
  @Property({ type: String }) channelId = /** @type {String} */ (null)
  // Public intake form the ticket came from (sourceId WEB_FORM).
  @Property({ type: String }) formId = /** @type {String} */ (null)
  // Dynamic form values submitted with the ticket (flat payload).
  @Property({ type: Object }) customFields = /** @type {Object} */ (null)
  // Immutable form definition captured at submission time — old tickets
  // always render from this, never from the (possibly edited) live form.
  @Property({ type: Object, excludeFromGraphQL: ['update'] }) formSnapshot = /** @type {Object} */ (
    null
  )
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) lastCustomerMessageAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) resolvedAt =
    /** @type {DateTime} */ (null)
  @Property({ type: DateTime, excludeFromGraphQL: ['update'] }) closedAt = /** @type {DateTime} */ (
    null
  )
  // Nullable — email-created tickets have no acting user.
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: String }) updatedBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
