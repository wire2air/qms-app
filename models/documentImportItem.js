import { currentSession } from '@/utils/currentSession'
import { BaseModel, ClientModel, Property } from '@syncEngine/index'
import { DateTime } from 'luxon'

// One file in a bulk document import, with its OWN status and failure reason —
// a batch of 200 where 3 fail has to say which 3 and why.
//
// title / sourceDocumentNumber / departmentName are read from the file's
// page-one header HERE, in the browser (usePdfImport.extractHeaderFields),
// before upload. Storing them on the row means the worker does no parsing and
// a retry never re-reads the PDF.
@ClientModel('documentImportItems', {
  primaryKey: 'id',
  syncField: 'updatedAt',
  customIndex: 'batchId, statusId',
})
export class DocumentImportItem extends BaseModel {
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
  @Property({ type: String, required: true }) batchId = ''
  @Property({ type: String }) assetId = null
  @Property({ type: String, required: true }) fileName = ''
  @Property({ type: String }) title = null
  @Property({ type: String }) sourceDocumentNumber = null
  @Property({ type: String }) departmentName = null
  @Property({ type: String }) summary = null
  // What the worker actually used: the matched department, or the batch
  // fallback. Distinct from departmentName so the queue can show whether the
  // name on the page resolved to anything.
  @Property({ type: String }) resolvedDepartmentId = null
  @Property({ type: String, required: true }) statusId = 'PENDING'
  @Property({ type: String }) documentId = null
  @Property({ type: String }) errorMessage = null
  @Property({ type: Object }) errorDetail = null
  @Property({ type: Number }) attempts = 0
  @Property({ type: DateTime }) processedAt = null
  @Property({ type: String }) createdBy = null
  @Property({ type: String }) updatedBy = null
  @Property({ type: DateTime }) deletedAt = null
  @Property({ type: DateTime, required: true, timestamp: true }) createdAt = null
  @Property({ type: DateTime, required: true, timestamp: true, autoUpdate: true }) updatedAt = null
}
