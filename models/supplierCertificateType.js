import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * SupplierCertificateType — per-tenant taxonomy classifying certs
 * tracked on supplier_assets (rows with is_certificate=true).
 *
 * Seeded at signup with 8 common certs (ISO 9001 / 13485 / 14001 /
 * AS9100 / IATF 16949 / FDA 21 CFR 820 / Insurance / Other). Tenants
 * rename / add / deactivate from Settings → Lookups.
 *
 * Soft FK from SupplierAsset.certificateTypeId; the cert row's
 * is_certificate + expires_at carry the rest. Mirrors RootCauseCategory
 * + HazardCategory shape so the badge triad pattern works identically.
 */
@ClientModel('supplierCertificateTypes', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'companyId, [companyId+code]',
})
export class SupplierCertificateType extends BaseModel {
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
  @Property({ type: String }) color = ''
  @Property({ type: Number }) displayOrder = 1000
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
