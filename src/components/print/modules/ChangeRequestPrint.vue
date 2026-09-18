<script setup>
import FormSchemaReadonlyView from '@/components/form/FormSchemaReadonlyView.vue'
import '../recordPrint.css'

/**
 * Change Request print module.
 *
 * Same defect as the NC one: ChangeRequestsPageId linked to
 * `?module=ChangeRequest` against a registry that never had it, so the button
 * opened "Unknown print module". Found by printModuleRegistry.spec.js while
 * fixing NC (2026-08-18), not by anyone clicking it.
 *
 * Layout follows NonconformancePrint / CapaPrint via recordPrint.css. The one
 * CR-specific part is the change-assessment block — classification, nature,
 * duration, regulatory impact, customer notification — which is what a reviewer
 * actually signs off on and has no analogue in the other modules.
 */

const props = defineProps({
  id: { type: String, default: null },
})

const cr = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => (id ? db.ChangeRequest.findByPk(id) : null),
  { models: ['ChangeRequest'] },
)

const workflowInstance = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return null
    const results = await db.WorkflowInstance.where('[resourceType+resourceId]', [
      'ChangeRequest',
      id,
    ]).exec()
    return (
      results.sort(
        (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
      )[0] ?? null
    )
  },
  { models: ['WorkflowInstance'] },
)

const workflowVersion = useLiveQueryWithDeps(
  [() => workflowInstance.value?.workflowVersionId ?? cr.value?.workflowVersionId],
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

const allRecords = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const all = await db.CrRecord.where('changeRequestId', id).exec()
    return all.filter((r) => r.submittedAt)
  },
  { models: ['CrRecord'], initial: [] },
)

function recordsForStep(stepId) {
  return allRecords.value.filter((r) => r.workflowInstanceStepId === stepId)
}

const userIds = computed(() => {
  const set = new Set()
  if (cr.value?.ownerId) set.add(cr.value.ownerId)
  if (cr.value?.createdBy) set.add(cr.value.createdBy)
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

const changeType = useLiveQueryWithDeps(
  [() => cr.value?.changeTypeId],
  async (db, [id]) => (id ? db.ChangeType.findByPk(id) : null),
  { models: ['ChangeType'] },
)
const crSite = useLiveQueryWithDeps(
  [() => cr.value?.siteId],
  async (db, [id]) => (id ? db.Site.findByPk(id) : null),
  { models: ['Site'] },
)
const crDepartment = useLiveQueryWithDeps(
  [() => cr.value?.departmentId],
  async (db, [id]) => (id ? db.Department.findByPk(id) : null),
  { models: ['Department'] },
)

const identifier = computed(() => cr.value?.crNumber ?? '')

// Only print the assessment block when the reviewer actually filled something
// in — an all-dashes table reads as "assessed and found to be nothing".
const hasAssessment = computed(() =>
  [
    cr.value?.classification,
    cr.value?.changeNature,
    cr.value?.changeDuration,
    cr.value?.regulatoryImpact,
    cr.value?.customerNotificationRequired,
  ].some(Boolean),
)

const auditEntities = computed(() => {
  const out = []
  if (cr.value?.id) out.push({ entityType: 'ChangeRequests', entityId: cr.value.id })
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

const ready = computed(() => !!cr.value)

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
  <PrintLayout :status="cr?.statusId" :identifier="identifier" :auditEntities="auditEntities">
    <template #title>
      <div class="qp-num">{{ cr?.crNumber || 'Draft' }}</div>
      <h1 class="qp-title">{{ cr?.title }}</h1>
      <table class="qp-meta">
        <tbody>
          <tr>
            <th>CR Number</th>
            <td>{{ cr?.crNumber || '—' }}</td>
            <th>Status</th>
            <td>{{ cr?.statusId || '—' }}</td>
          </tr>
          <tr>
            <th>Change Type</th>
            <td>{{ changeType?.name || cr?.changeTypeId || '—' }}</td>
            <th>Priority</th>
            <td>{{ cr?.priorityId || '—' }}</td>
          </tr>
          <tr>
            <th>Site</th>
            <td>{{ crSite?.name || '—' }}</td>
            <th>Department</th>
            <td>{{ crDepartment?.name || '—' }}</td>
          </tr>
          <tr>
            <th>Owner</th>
            <td>{{ userName(cr?.ownerId) }}</td>
            <th>Raised By</th>
            <td>{{ userName(cr?.createdBy) }}</td>
          </tr>
          <tr>
            <th>Initiated</th>
            <td>{{ fmtDate(cr?.initiatedAt) }}</td>
            <th>Target Implementation</th>
            <td>{{ fmtDate(cr?.targetImplementationDate) }}</td>
          </tr>
          <tr v-if="cr?.approvedAt || cr?.closedAt || cr?.cancelledAt">
            <th>Approved</th>
            <td>{{ fmtDateTime(cr?.approvedAt) }}</td>
            <th>{{ cr?.cancelledAt ? 'Cancelled' : 'Closed' }}</th>
            <td>{{ fmtDateTime(cr?.cancelledAt || cr?.closedAt) }}</td>
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

    <div v-if="!ready" class="tw:py-10 tw:text-secondary tw:text-center">
      Loading change request…
    </div>
    <div v-else class="qp-body">
      <section v-if="cr?.description || cr?.reasonForChange" class="qp-section">
        <h2>1. Change Description &amp; Rationale</h2>
        <div v-if="cr?.description" class="qp-paragraph" v-html="cr.description" />
        <template v-if="cr?.reasonForChange">
          <div class="qp-step-label">Reason for Change</div>
          <div class="qp-paragraph" v-html="cr.reasonForChange" />
        </template>
        <template v-if="cr?.businessJustification">
          <div class="qp-step-label">Business Justification</div>
          <div class="qp-paragraph" v-html="cr.businessJustification" />
        </template>
      </section>

      <section v-if="hasAssessment" class="qp-section">
        <h2>2. Change Assessment</h2>
        <table class="qp-meta">
          <tbody>
            <tr>
              <th>Classification</th>
              <td>{{ cr?.classification || '—' }}</td>
              <th>Nature</th>
              <td>{{ cr?.changeNature || '—' }}</td>
            </tr>
            <tr>
              <th>Duration</th>
              <td>{{ cr?.changeDuration || '—' }}</td>
              <th>Regulatory Impact</th>
              <td>{{ cr?.regulatoryImpact || '—' }}</td>
            </tr>
            <tr>
              <th>Customer Notification</th>
              <td colspan="3">{{ cr?.customerNotificationRequired || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="rootSteps.length" class="qp-section">
        <h2>3. Review &amp; Approval</h2>
        <p class="qp-paragraph qp-note">
          The {{ rootSteps.length }} step{{ rootSteps.length === 1 ? '' : 's' }} executed for this
          change request, including assignees, completion, and any form data captured.
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

      <section v-if="cr?.cancelReason" class="qp-section">
        <h2>Cancellation Reason</h2>
        <p class="qp-paragraph">{{ cr.cancelReason }}</p>
      </section>
    </div>
  </PrintLayout>
</template>
