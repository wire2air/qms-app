<script setup>
import FormSchemaReadonlyView from '@/components/form/FormSchemaReadonlyView.vue'
import '../recordPrint.css'

/**
 * Nonconformance print module.
 *
 * The registry carried `// Future: Nonconformance` while NonconformancesPageId
 * already linked to `?module=Nonconformance` — so the NC Print button had been
 * opening the shell's "Unknown print module" error the whole time (reported
 * 2026-08-18). This is that module.
 *
 * Structured to mirror CapaPrint so a CAPA and the NC it came from read as one
 * document family: title block + meta table, then description, containment,
 * the workflow steps with their submitted form data, and a disposition
 * appendix. Shared chrome (branding, audit trail, signatures) comes from
 * PrintLayout; shared styles from recordPrint.css.
 *
 * Self-contained by the registry's contract: reads its own id, runs its own
 * live queries, auto-fires window.print() once the record has loaded.
 */

const props = defineProps({
  id: { type: String, default: null },
})

const nc = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => (id ? db.Nonconformance.findByPk(id) : null),
  { models: ['Nonconformance'] },
)

const workflowInstance = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    const results = await db.WorkflowInstance.where('[resourceType+resourceId]', [
      'Nonconformance',
      id,
    ]).exec()
    // Most recent wins — an NC that was sent back and re-opened has more than one.
    return (
      results.sort(
        (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
      )[0] ?? null
    )
  },
  { models: ['WorkflowInstance'] },
)

const workflowVersion = useLiveQueryWithDeps(
  [() => workflowInstance.value?.workflowVersionId ?? nc.value?.workflowVersionId],
  async (db, [versionId]) => (versionId ? db.WorkflowVersion.findByPk(versionId) : null),
  { models: ['WorkflowVersion'] },
)

const workflow = useLiveQueryWithDeps(
  [() => workflowVersion.value?.workflowId],
  async (db, [workflowId]) => (workflowId ? db.Workflow.findByPk(workflowId) : null),
  { models: ['Workflow'] },
)

const allSteps = useLiveQueryWithDeps(
  [() => workflowInstance.value?.id],
  async (db, [instanceId]) => {
    if (!instanceId) return []
    return db.WorkflowInstanceStep.where('workflowInstanceId', instanceId)
      .orderBy('stepNumber', 'asc')
      .exec()
  },
  { models: ['WorkflowInstanceStep'], initial: [] },
)

const rootSteps = computed(() => allSteps.value.filter((s) => !s.parentInstanceStepId))
function childrenOf(parentId) {
  return allSteps.value
    .filter((s) => s.parentInstanceStepId === parentId)
    .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0))
}

const allStepIds = computed(() => allSteps.value.map((s) => s.id))

const allAssignments = useLiveQueryWithDeps(
  [() => allStepIds.value.join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const fetched = await Promise.all(
      idsStr
        .split(',')
        .map((id) => db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()),
    )
    return fetched.flat()
  },
  { models: ['UserOnWorkflowInstanceStep'], initial: [] },
)

// Who actually did the step: the approver if there is one, else whoever holds
// it now. REASSIGNED rows are stale by definition and never the answer.
function assigneeIdFor(stepId) {
  const row =
    allAssignments.value.find(
      (a) => a.workflowInstanceStepId === stepId && a.statusId === 'APPROVED',
    ) ??
    allAssignments.value.find(
      (a) => a.workflowInstanceStepId === stepId && a.statusId !== 'REASSIGNED',
    )
  return row?.userId ?? null
}

// Submitted NcRecord per step (the assignee's form answers). Drafts
// (submittedAt null) are deliberately excluded — an unsubmitted answer is not
// part of the record.
const allRecords = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const all = await db.NcRecord.where('ncId', id).exec()
    return all.filter((r) => r.submittedAt)
  },
  { models: ['NcRecord'], initial: [] },
)

function recordsForStep(stepId) {
  return allRecords.value.filter((r) => r.workflowInstanceStepId === stepId)
}

const userIds = computed(() => {
  const set = new Set()
  if (nc.value?.ownerId) set.add(nc.value.ownerId)
  if (nc.value?.createdBy) set.add(nc.value.createdBy)
  for (const a of allAssignments.value) if (a.userId) set.add(a.userId)
  for (const r of allRecords.value) if (r.userId) set.add(r.userId)
  return [...set]
})

const userMap = useLiveQueryWithDeps(
  [() => userIds.value.join(',')],
  async (db, [idsStr]) => {
    const ids = idsStr ? idsStr.split(',') : []
    if (!ids.length) return {}
    const users = await Promise.all(ids.map((id) => db.User.findByPk(id)))
    const map = {}
    for (const u of users.filter(Boolean)) {
      map[u.id] = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id
    }
    return map
  },
  { models: ['User'], initial: {} },
)

function userName(id) {
  return id ? (userMap.value[id] ?? id) : '—'
}

// Label lookups — each a cheap findByPk against its own store.
const ncType = useLiveQueryWithDeps(
  [() => nc.value?.typeId],
  async (db, [id]) => (id ? db.NcType.findByPk(id) : null),
  { models: ['NcType'] },
)
const ncSource = useLiveQueryWithDeps(
  [() => nc.value?.sourceId],
  async (db, [id]) => (id ? db.NcSource.findByPk(id) : null),
  { models: ['NcSource'] },
)
const ncSeverity = useLiveQueryWithDeps(
  [() => nc.value?.severityId],
  async (db, [id]) => (id ? db.NcSeverity.findByPk(id) : null),
  { models: ['NcSeverity'] },
)
const ncStatus = useLiveQueryWithDeps(
  [() => nc.value?.statusId],
  async (db, [id]) => (id ? db.NcStatus.findByPk(id) : null),
  { models: ['NcStatus'] },
)
// Shared quality classification (event_categories) — same taxonomy the source
// Quality Event and any spawned CAPA carry.
const ncCategory = useLiveQueryWithDeps(
  [() => nc.value?.categoryId],
  async (db, [id]) => (id ? db.EventCategory.findByPk(id) : null),
  { models: ['EventCategory'] },
)
const ncSite = useLiveQueryWithDeps(
  [() => nc.value?.siteId],
  async (db, [id]) => (id ? db.Site.findByPk(id) : null),
  { models: ['Site'] },
)
const ncDepartment = useLiveQueryWithDeps(
  [() => nc.value?.departmentId],
  async (db, [id]) => (id ? db.Department.findByPk(id) : null),
  { models: ['Department'] },
)
const ncProduct = useLiveQueryWithDeps(
  [() => nc.value?.productId],
  async (db, [id]) => (id ? db.Product.findByPk(id) : null),
  { models: ['Product'] },
)
const ncSupplier = useLiveQueryWithDeps(
  [() => nc.value?.supplierId],
  async (db, [id]) => (id ? db.Supplier.findByPk(id) : null),
  { models: ['Supplier'] },
)
const ncDisposition = useLiveQueryWithDeps(
  [() => nc.value?.dispositionTypeId],
  async (db, [id]) => (id ? db.NcDispositionType.findByPk(id) : null),
  { models: ['NcDispositionType'] },
)

const identifier = computed(() => nc.value?.ncNumber ?? '')

// Commercial references only earn a row when at least one is set — most NCs
// carry none and an all-dashes row is noise on a printed page.
const hasCommercialRefs = computed(
  () => !!(nc.value?.poNumber || nc.value?.orderNumber || nc.value?.lotNumber),
)

const auditEntities = computed(() => {
  const out = []
  if (nc.value?.id) out.push({ entityType: 'Nonconformances', entityId: nc.value.id })
  if (workflowInstance.value?.id) {
    out.push({ entityType: 'WorkflowInstances', entityId: workflowInstance.value.id })
  }
  for (const s of allSteps.value) {
    out.push({ entityType: 'WorkflowInstanceSteps', entityId: s.id })
  }
  return out
})

function fmtDate(d) {
  if (!d) return '—'
  if (d.toFormat) return d.toFormat('LLL d, yyyy')
  return new Date(d).toLocaleDateString()
}

function fmtDateTime(d) {
  if (!d) return '—'
  if (d.toFormat) return d.toFormat('LLL d, yyyy HH:mm')
  return new Date(d).toLocaleString()
}

const ready = computed(() => !!nc.value)

// Poll rather than watch: in a fresh tab the syncEngine is still bootstrapping
// when this mounts, so the record arrives some hundreds of ms later. 20 × 200ms
// then give up — printing an empty page is worse than not printing.
onMounted(() => {
  const tryPrint = (attempts = 0) => {
    if (ready.value) {
      setTimeout(() => window.print(), 200)
      return
    }
    if (attempts < 20) setTimeout(() => tryPrint(attempts + 1), 200)
  }
  tryPrint()
})
</script>

<template>
  <PrintLayout :status="nc?.statusId" :identifier="identifier" :auditEntities="auditEntities">
    <template #title>
      <div class="qp-num">{{ nc?.ncNumber }}</div>
      <h1 class="qp-title">{{ nc?.title }}</h1>
      <table class="qp-meta">
        <tbody>
          <tr>
            <th>NC Number</th>
            <td>{{ nc?.ncNumber || '—' }}</td>
            <th>Status</th>
            <td>{{ ncStatus?.name || nc?.statusId || '—' }}</td>
          </tr>
          <tr>
            <th>Type</th>
            <td>{{ ncType?.name || nc?.typeId || '—' }}</td>
            <th>Severity</th>
            <td>{{ ncSeverity?.name || nc?.severityId || '—' }}</td>
          </tr>
          <tr>
            <th>Category</th>
            <td>{{ ncCategory?.name || '—' }}</td>
            <th>Detection Source</th>
            <td>{{ ncSource?.name || nc?.sourceId || '—' }}</td>
          </tr>
          <tr>
            <th>Site</th>
            <td>{{ ncSite?.name || '—' }}</td>
            <th>Department</th>
            <td>{{ ncDepartment?.name || '—' }}</td>
          </tr>
          <tr>
            <th>Item</th>
            <td>{{ ncProduct?.name || '—' }}</td>
            <th>Supplier</th>
            <td>{{ ncSupplier?.name || '—' }}</td>
          </tr>
          <tr>
            <th>Owner</th>
            <td>{{ userName(nc?.ownerId) }}</td>
            <th>Raised By</th>
            <td>{{ userName(nc?.createdBy) }}</td>
          </tr>
          <tr>
            <th>Detected</th>
            <td>{{ fmtDate(nc?.detectedAt) }}</td>
            <th>Due Date</th>
            <td>{{ fmtDate(nc?.dueDate) }}</td>
          </tr>
          <tr v-if="hasCommercialRefs">
            <th>PO / Order #</th>
            <td>{{ [nc?.poNumber, nc?.orderNumber].filter(Boolean).join(' / ') || '—' }}</td>
            <th>Lot / Qty</th>
            <td>
              {{
                [
                  nc?.lotNumber,
                  nc?.qtyAffected && `${nc.qtyAffected} ${nc.unitOfMeasure || ''}`.trim(),
                ]
                  .filter(Boolean)
                  .join(' / ') || '—'
              }}
            </td>
          </tr>
          <tr v-if="nc?.closedAt">
            <th>Closed</th>
            <td>{{ fmtDateTime(nc?.closedAt) }}</td>
            <th>Disposition</th>
            <td>{{ ncDisposition?.name || '—' }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="workflow" class="qp-workflow">
        Workflow: <strong>{{ workflow.name }}</strong>
        <span v-if="workflowVersion">
          (v{{
            workflowVersion.versionLabel ||
            `${workflowVersion.versionMajor ?? 1}.${workflowVersion.versionMinor ?? 0}`
          }})
        </span>
      </div>
    </template>

    <div v-if="!ready" class="tw:py-10 tw:text-secondary tw:text-center">Loading NC…</div>
    <div v-else class="qp-body">
      <section v-if="nc?.description" class="qp-section">
        <h2>1. Description</h2>
        <div class="qp-paragraph" v-html="nc.description" />
      </section>

      <!-- Containment is the regulator's first question on any NC: what did you
           do at the moment of detection? It prints ahead of the workflow. -->
      <section v-if="nc?.immediateContainmentAction" class="qp-section">
        <h2>2. Immediate Containment Action</h2>
        <div class="qp-paragraph" v-html="nc.immediateContainmentAction" />
      </section>

      <section v-if="rootSteps.length" class="qp-section">
        <h2>3. Investigation &amp; Disposition</h2>
        <p class="qp-paragraph qp-note">
          The {{ rootSteps.length }} step{{ rootSteps.length === 1 ? '' : 's' }} executed for this
          nonconformance, including assignees, completion, and any form data captured.
        </p>
        <div v-for="(step, idx) in rootSteps" :key="step.id" class="qp-step">
          <div class="qp-step-head">
            <div class="qp-step-num">{{ idx + 1 }}</div>
            <div class="qp-step-meta">
              <div class="qp-step-title">{{ step.name || 'Step' }}</div>
              <div class="qp-step-detail">
                Status: <strong>{{ step.statusId }}</strong> · Assignee:
                <strong>{{ userName(assigneeIdFor(step.id)) }}</strong>
                <template v-if="step.completedAt">
                  · Completed {{ fmtDateTime(step.completedAt) }}
                </template>
              </div>
            </div>
          </div>
          <div v-if="step.description" class="qp-step-instructions">
            <span class="qp-step-label">Instructions:</span>
            <span v-html="step.description" />
          </div>
          <div v-for="record in recordsForStep(step.id)" :key="record.id" class="qp-record">
            <div class="qp-record-head">
              <strong>{{ userName(record.userId) }}</strong>
              submitted {{ fmtDateTime(record.submittedAt) }}
            </div>
            <FormSchemaReadonlyView
              v-if="record.payload && Object.keys(record.payload).length"
              :fields="step.formSchema || []"
              :values="record.payload"
            />
          </div>
          <div v-if="childrenOf(step.id).length" class="qp-children">
            <div class="qp-children-label">Sub-tasks</div>
            <div v-for="(child, ci) in childrenOf(step.id)" :key="child.id" class="qp-child">
              <div class="qp-child-head">
                <strong>{{ idx + 1 }}.{{ ci + 1 }}</strong>
                {{ child.name || 'Sub-task' }}
                · {{ child.statusId }} · Assignee: {{ userName(assigneeIdFor(child.id)) }}
                <template v-if="child.completedAt">
                  · Completed {{ fmtDateTime(child.completedAt) }}
                </template>
              </div>
              <div v-for="record in recordsForStep(child.id)" :key="record.id" class="qp-record">
                <div class="qp-record-head">
                  <strong>{{ userName(record.userId) }}</strong>
                  submitted {{ fmtDateTime(record.submittedAt) }}
                </div>
                <FormSchemaReadonlyView
                  v-if="record.payload && Object.keys(record.payload).length"
                  :fields="child.formSchema || []"
                  :values="record.payload"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="nc?.dispositionTypeId || nc?.dispositionNotes" class="qp-section">
        <h2>4. Disposition</h2>
        <p class="qp-paragraph">
          <strong>{{ ncDisposition?.name || '—' }}</strong>
        </p>
        <p v-if="nc?.dispositionNotes" class="qp-paragraph">{{ nc.dispositionNotes }}</p>
      </section>
    </div>
  </PrintLayout>
</template>
