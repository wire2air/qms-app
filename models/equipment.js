import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * Equipment — industrial / instrument / machine. Referenced from log
 * books (calibration, PM, equipment-specific routine checks).
 *
 * Round 0.5 ships this with a minimal field set. Future Equipment
 * module work will extend (maintenance windows, parts inventory,
 * warranty docs).
 */
// `equipment` is uncountable in English — PostGraphile's
// `pg-simplify-inflection` plugin disambiguates with the
// `distinctPluralize` rule, which appends `-s` to produce
// `equipments` as the GraphQL collection name. The single-row
// query stays at `equipment(id: UUID!)`. We must point the
// SyncEngine bootstrap at the *plural* collection; using
// 'equipment' here would resolve to the singular query and the
// bootstrap fails with "Unknown argument filter / first / orderBy".
@ClientModel('equipments', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, statusId, siteId',
})
export class Equipment extends BaseModel {
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

  @Property({ type: String }) manufacturer = ''
  @Property({ type: String }) model = ''
  @Property({ type: String }) serialNumber = ''
  @Property({ type: String }) category = ''

  @Property({ type: String }) siteId = ''
  @Property({ type: String }) departmentId = ''
  @Property({ type: String }) supplierId = ''
  // Optional instrument custodian — refines department ownership for reminders.
  @Property({ type: String }) ownerUserId = /** @type {String} */ (null)

  @Property({ type: String }) statusId = 'IN_SERVICE'

  @Property({ type: DateTime }) installedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) retiredAt = /** @type {DateTime} */ (null)
  // Calibration program: explicit "tracked" flag + interval drives the
  // next-due date and the daily calibration-due reminder.
  @Property({ type: Boolean }) requiresCalibration = false
  @Property({ type: Number }) calibrationInterval = /** @type {Number} */ (null)
  @Property({ type: String }) calibrationIntervalUnit = 'MONTH'
  @Property({ type: DateTime }) lastCalibratedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) nextCalibrationDue = /** @type {DateTime} */ (null)
  // Certificate + vendor evidence for the MOST RECENT calibration (migration
  // 20260911120000). `record-calibration` now REQUIRES a certificate number and
  // one of the two vendor forms, so these are never null on an instrument that
  // has been calibrated through the product. Synced (rather than left
  // server-only) because the alternative is a register that cannot show the
  // evidence its own quick action just demanded — the module has no detail page
  // and no print module, so IndexedDB is the only place the UI can read it from.
  //
  // READ-ONLY on the client, by construction. A `SECURITY INVOKER` BEFORE
  // INSERT/UPDATE trigger (migration 20260911150000) refuses any CHANGE to these
  // four on the `app_user` connection — which is exactly the connection the edit
  // dialog's SyncEngine save runs on — so a mutation carrying a changed value
  // fails at the database with "Calibration certificate evidence can only be set
  // by recording a calibration". `excludeFromGraphQL` keeps them out of the
  // generated create/update mutations entirely, making that unreachable rather
  // than merely unlikely.
  //
  // It also closes the empty-string-into-UUID trap on `lastCalibrationVendorId`:
  // that column is a uuid, `''` is not a uuid, and the SyncEngine write path has
  // produced bare 400s from exactly this shape before. Defaulted to null here as
  // well as excluded — belt and braces, because a default is what a locally
  // constructed instance starts from.
  @Property({ type: String, excludeFromGraphQL: ['create', 'update'] })
  lastCalibrationCertificateNumber = /** @type {String} */ (null)
  @Property({ type: String, excludeFromGraphQL: ['create', 'update'] })
  lastCalibrationCertificateUrl = /** @type {String} */ (null)
  @Property({ type: String, excludeFromGraphQL: ['create', 'update'] })
  lastCalibrationVendorId = /** @type {String} */ (null)
  @Property({ type: String, excludeFromGraphQL: ['create', 'update'] })
  lastCalibrationVendorName = /** @type {String} */ (null)
  @Property({ type: DateTime }) nextPmDue = /** @type {DateTime} */ (null)
  // PM program — calibration's twin (2026-08-06).
  @Property({ type: Boolean }) requiresPm = false
  @Property({ type: Number }) pmInterval = /** @type {number|null} */ (null)
  @Property({ type: String }) pmIntervalUnit = 'MONTH'
  @Property({ type: DateTime }) lastPmAt = /** @type {DateTime} */ (null)

  @Property({ type: String }) locationText = ''
  @Property({ type: String }) notes = ''

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
