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
  @Property({ type: DateTime }) nextPmDue = /** @type {DateTime} */ (null)

  @Property({ type: String }) locationText = ''
  @Property({ type: String }) notes = ''

  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
