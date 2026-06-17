import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * DefectCatalog — the per-tenant Test / Characteristic Library (table name kept
 * for history). A reusable master list of inspection tests; picking one when
 * building a specification pre-fills the characteristic's name, type, default
 * severity (defect class), method, and limits — all overridable.
 */
@ClientModel('defectCatalogs', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, [companyId+code]',
})
export class DefectCatalog extends BaseModel {
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
  @Property({ type: String }) description = /** @type {String} */ (null)
  // CRITICAL | MAJOR | MINOR
  @Property({ type: String, required: true }) defaultSeverity = 'MAJOR'
  // Test-template fields — pre-fill a spec characteristic on pick.
  @Property({ type: String }) testType = 'PASS_FAIL'
  @Property({ type: String }) testMethod = /** @type {String} */ (null)
  @Property({ type: Boolean }) requiresInstrument = false
  // Preferred instrument for this test — copied onto the characteristic on pick.
  @Property({ type: String }) preferredEquipmentId = /** @type {String} */ (null)
  @Property({ type: Number }) targetValue = /** @type {Number} */ (null)
  @Property({ type: Number }) lsl = /** @type {Number} */ (null)
  @Property({ type: Number }) usl = /** @type {Number} */ (null)
  @Property({ type: String }) uom = /** @type {String} */ (null)
  // null/empty = applies to all product types; else only these.
  @Property({ type: Array }) applicableProductTypeIds = /** @type {Array} */ (null)
  @Property({ type: Boolean }) active = true
  @Property({ type: String }) createdBy = /** @type {String} */ (null)
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
