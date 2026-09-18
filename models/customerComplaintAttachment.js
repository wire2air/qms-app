import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('customerComplaintAttachments', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'complaintId',
  schemaVersion: 1,
})
export class CustomerComplaintAttachment extends BaseModel {
  // NOT paranoid, deliberately — RLS on customer_complaint_attachments grants
  // app_user only DELETE + SELECT (no UPDATE; see database/rls.sql), and there
  // is no REST route for removing an attachment either (only the upload POST).
  // `paranoid: true` makes BaseModel#delete() set deletedAt and save() via an
  // UPDATE mutation instead of issuing a real delete — Postgres then rejects
  // that UPDATE for lack of privilege, which PostGraphile reports as an opaque
  // masked GraphQLError ("Something went wrong"). A real DELETE is exactly
  // what's granted, so this model must not be paranoid on the client side even
  // though the backend Sequelize model is (that side deletes via the
  // superuser connection, which never goes through this RLS grant at all).
  //
  // Declared explicitly rather than just omitted: `false` is already the
  // BaseModel default, so this changes no behaviour, but the models-wide guard
  // in workflowClientModelsParanoid.spec.js requires every model carrying a
  // deletedAt @Property to *state* its choice, so that a forgotten `paranoid`
  // stays distinguishable from a deliberate one.
  static paranoid = false

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
  @Property({ type: String, required: true }) complaintId = ''
  // Set when the file arrived on an email message; null for direct uploads.
  @Property({ type: String }) messageId = /** @type {String} */ (null)
  @Property({ type: String, required: true }) assetId = ''
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
