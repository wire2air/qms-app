import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// One bulk document import run. Holds the settings a client supplies ONCE for
// a pile of files — site, fallback department, document template (the source
// of the approval flow) and doc prefix — so they are not re-entered per file.
//
// Created and edited straight from the browser via the SyncEngine; only
// "start processing" is an action RPC, because enqueueing worker jobs is the
// one thing the browser cannot do (see routes/documentImports.js).
//
// The counters are maintained by the worker. Reading them beats counting items
// per row when the queue lists many batches.
@ClientModel('documentImportBatches', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'statusId',
})
export class DocumentImportBatch extends BaseModel {
  static paranoid = true

  constructor(...args) {
    super(...args)
    if (!this.companyId) this.companyId = currentSession.value?.companyId || ''
    if (!this.id) this.id = crypto.randomUUID()
    if (!this.createdBy) this.createdBy = currentSession.value?.userId || null
    if (!this.updatedBy) this.updatedBy = currentSession.value?.userId || null
  }

  @Property({ type: String, uuid: true, required: true }) id = ''
  @Property({ type: String, required: true }) companyId = ''
  @Property({ type: String, required: true }) name = ''
  @Property({ type: String }) siteId = null
  // FALLBACK department — an item whose own header names one we can match uses
  // that instead.
  @Property({ type: String }) departmentId = null
  @Property({ type: String, required: true }) documentTemplateId = ''
  @Property({ type: String }) prefix = null
  @Property({ type: String, required: true }) statusId = 'DRAFT'
  @Property({ type: Number }) totalItems = 0
  @Property({ type: Number }) createdItems = 0
  @Property({ type: Number }) failedItems = 0
  @Property({ type: DateTime }) queuedAt = null
  @Property({ type: DateTime }) completedAt = null
  @Property({ type: String }) createdBy = null
  @Property({ type: String }) updatedBy = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true }) createdAt = null
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true }) updatedAt = null
}
