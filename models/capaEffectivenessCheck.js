import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

@ClientModel('capaEffectivenessChecks', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'capaId, taskInstanceId',
})
export class CapaEffectivenessCheck extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || ''
    if (!this.updatedBy) this.updatedBy = currentSession.value?.userId || ''
    if (!this.id) this.id = crypto.randomUUID()
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) capaId = ''
  @Property({ type: DateTime, required: true }) dueAt = /** @type {DateTime} */ (null)
  // CAPA-M2, the half finished on 2026-09-08. `capas.statusId` has carried
  // excludeFromGraphQL:['update'] since the 2026-07-21 hardening; this one did
  // not, so the effectiveness check's status WAS in the generated mutation
  // input and a capa:update holder could mark a check COMPLETED without an
  // outcome, verification notes or the Part-11 signature that
  // completeEffectivenessCheck demands.
  //
  // This lock is defense-in-depth ONLY — it removes the field from the
  // mutation this client generates (syncEngine/persistence/hydration.js:247),
  // which a hand-written GraphQL call ignores. The real control is the DB
  // trigger `capa_effectiveness_checks_status_transition_guard`
  // (qms migration 20260909400000). Both, for the same reason `capas` has both.
  @Property({ type: String, required: true, excludeFromGraphQL: ['update'] }) statusId = 'PENDING'
  @Property({ type: String }) taskInstanceId = /** @type {String} */ (null)
  @Property({ type: String }) parentCheckId = /** @type {String} */ (null)
  // Verdict on completed rows: 'EFFECTIVE' | 'NOT_EFFECTIVE' | null
  @Property({ type: String }) outcome = /** @type {String} */ (null)
  @Property({ type: String }) comments = ''
  @Property({ type: DateTime }) completedAt = /** @type {DateTime} */ (null)
  @Property({ type: String }) completedBy = /** @type {String} */ (null)
  @Property({ type: String, required: true }) createdBy = ''
  @Property({ type: String, required: true }) updatedBy = ''
  @Property({ type: DateTime, required: true, timestamp: true })
  createdAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true })
  updatedAt = /** @type {DateTime} */ (null)
  @Property({ type: DateTime }) deletedAt = /** @type {DateTime} */ (null)
}
