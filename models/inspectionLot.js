import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('inspectionLots', { primaryKey: 'id', syncField: 'updatedAt', customIndex: 'statusId' })
export class InspectionLot extends BaseModel {
  static paranoid = true
  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }
  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) lotNumber = ''
  @Property({ type: String, required: true }) inspectionPoint = 'INCOMING'
  @Property({ type: String }) source = 'MANUAL'
  // QC-C1 (client half): the lifecycle is SERVER-OWNED, on both columns.
  //
  // The 2026-08-28 unification (20260828190000) split one overloaded column
  // into two facts, and BOTH are lifecycle state:
  //
  //   statusId        DRAFT / OPEN / CLOSED / CANCELLED  — the parent status
  //   inspectionPhase PENDING → IN_PROGRESS → COMPLETED → UNDER_REVIEW →
  //                   DISPOSED, or HOLD                  — execution progress
  //
  // Neither has a client-side writer and neither should acquire one. Every
  // legal edge is a gated server endpoint that also files the
  // `inspection_lot_events` row the history panel reads:
  //
  //   POST /lots/:id/check-in    claim the lot (and Start, when PENDING)
  //   POST /lots/:id/start       PENDING     -> IN_PROGRESS
  //   POST /lots/:id/complete    IN_PROGRESS -> COMPLETED  (completeness gate)
  //   POST /lots/:id/submit      COMPLETED   -> UNDER_REVIEW (retain-sample gate)
  //   POST /lots/:id/reopen      audited reversal, e-signed
  //   POST /lots/:id/check-out   release the lot
  //
  // and the terminal CLOSED/DISPOSED pair is written by the disposition
  // handler off `disposition_type_id`, never set directly.
  //
  // `excludeFromGraphQL: ['update']` keeps both fields out of the generated
  // `updateInspectionLot` mutation entirely (hydration.js `computeUpdatePatch`
  // drops them from every patch), so no inline autosave can carry them. It is
  // the client half of QC finding #1 — a hand-rolled mutation still reaches
  // PostGraphile as `app_user`, and only the DB transition trigger stops that.
  // See e2e/qcInspection/j8-lot-lifecycle-lock.spec.js, which asserts all
  // three layers.
  @Property({ type: String, excludeFromGraphQL: ['update'] }) statusId = 'DRAFT'
  @Property({ type: String, excludeFromGraphQL: ['update'] }) inspectionPhase = 'PENDING'
  @Property({ type: String }) productId = /** @type {String} */ (null)
  @Property({ type: String }) supplierId = /** @type {String} */ (null)
  @Property({ type: String }) templateId = /** @type {String} */ (null)
  @Property({ type: String }) specificationId = /** @type {String} */ (null)
  @Property({ type: String }) samplingPlanId = /** @type {String} */ (null)
  @Property({ type: Object }) specSnapshot = /** @type {Object} */ (null)
  @Property({ type: Object }) samplingSnapshot = /** @type {Object} */ (null)
  @Property({ type: Number }) quantity = /** @type {Number} */ (null)
  // Containers received (drums/bags) — the N in formula sampling (sqrt(N)+1).
  @Property({ type: Number }) containerCount = /** @type {Number} */ (null)
  // Unit of measure for quantity (uoms lookup).
  @Property({ type: String }) uomId = /** @type {String} */ (null)
  @Property({ type: Number }) sampleSize = /** @type {Number} */ (null)
  // 'LOT' = one result per characteristic; 'SAMPLE' = a result per sampled unit.
  @Property({ type: String }) captureMode = 'LOT'
  @Property({ type: String }) poNumber = /** @type {String} */ (null)
  @Property({ type: String }) receiptNumber = /** @type {String} */ (null)
  @Property({ type: String }) workOrder = /** @type {String} */ (null)
  @Property({ type: String }) batchNumber = /** @type {String} */ (null)
  @Property({ type: DateTime }) manufacturingDate = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) expiryDate = /** @type {DateTime} */ (null)
  // Incoming (IQC): supplier COA + goods-receipt date.
  @Property({ type: Boolean }) coaReceived = /** @type {Boolean} */ (null)
  @Property({ type: Array }) coaAttachments = /** @type {Array} */ ([])
  @Property({ type: DateTime }) receivedDate = /** @type {DateTime} */ (null)
  // In-process (IPQC): line/stage, shift, operator, sampling clock time.
  @Property({ type: String }) lineId = /** @type {String} */ (null)
  @Property({ type: String }) shiftId = /** @type {String} */ (null)
  @Property({ type: String }) operatorUserId = /** @type {String} */ (null)
  @Property({ type: DateTime }) samplingTime = /** @type {DateTime} */ (null)
  @Property({ type: String }) activeBatchId = /** @type {String} */ (null)
  @Property({ type: String }) workflowInstanceId = /** @type {String} */ (null)
  // FK → ncDispositionTypes (shared QC + NC disposition lookup).
  @Property({ type: String }) dispositionTypeId = /** @type {String} */ (null)
  @Property({ type: String }) dispositionNotes = /** @type {String} */ (null)
  @Property({ type: Boolean }) autoCreateNcOnReject = /** @type {Boolean} */ (null)
  @Property({ type: Array }) notifyGroupIdsOnPass = /** @type {Array} */ ([])
  @Property({ type: Array }) notifyGroupIdsOnFail = /** @type {Array} */ ([])
  @Property({ type: String }) qualityState = /** @type {String} */ (null)
  @Property({ type: String }) ncId = /** @type {String} */ (null)
  @Property({ type: String }) equipmentId = /** @type {String} */ (null)
  @Property({ type: String }) assignedTo = /** @type {String} */ (null)
  @Property({ type: String }) notes = /** @type {String} */ (null)
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
