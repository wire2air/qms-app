import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

/**
 * AuditFindingStatus — the global status vocabulary for audit findings.
 *
 * Global, not per-tenant: no companyId, no paranoid flag. Same shape as
 * DocumentStatus and NcStatus, which is why it carries no constructor — the
 * rows are reference data every tenant shares, seeded by migration.
 *
 * Mirrored on the client so the custom-metric builder can offer these as a
 * PICKER rather than a text box. `analytics_module_fields` names
 * `audit_finding_statuses` as the lookupTable for audit_findings.status_id, and
 * a filter value typed by hand compiles cleanly whatever it says — a mistyped
 * status yields a metric that is permanently zero and reports no error. The
 * picker is what makes that unreachable.
 */
@ClientModel('auditFindingStatuses', { primaryKey: 'id', syncField: 'updatedAt' })
export class AuditFindingStatus extends BaseModel {
  @Property({ type: String, required: true }) id = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) description = ''
  @Property({ type: Number }) displayOrder = 1000
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
}
