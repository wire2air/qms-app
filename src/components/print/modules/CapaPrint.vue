<script setup>
import FormSchemaReadonlyView from '@/components/form/FormSchemaReadonlyView.vue'

/**
 * CAPA print module.
 *
 * Self-contained: fetches the CAPA + its workflow instance + steps + per-
 * step form records via SyncEngine, passes audit entities to PrintLayout,
 * renders title block + meta table + step-by-step body + effectiveness
 * check appendix.
 *
 * Form payloads are rendered via FormSchemaReadonlyView (the same
 * readonly renderer used by NcWorkflowStep / WorkflowStepForm
 * readonly mode / DocumentVersionSection). It pulls labels from the
 * schema, renders rich-text fields with v-html, resolves option-set
 * labels — keeping the print view consistent with the in-app view.
 *
 * Auto-fires window.print() ~600ms after the layout has the data it needs
 * (mirrors DocumentPrint).
 */

const props = defineProps({
  id: { type: String, default: null },
})

const capa = useLiveQueryWithDeps([() => props.id], async (db, [id]) => {
  if (!id) return null
  return db.Capa.findByPk(id)
})

const workflowInstance = useLiveQueryWithDeps([() => props.id], async (db, [id]) => {
  if (!id) return null
  const results = await db.WorkflowInstance.where('[resourceType+resourceId]', ['Capa', id]).exec()
  // Pick the most recent for the audit/print purposes
  return (
    results.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))[0] ??
    null
  )
})

const workflowVersion = useLiveQueryWithDeps(
  [() => workflowInstance.value?.workflowVersionId ?? capa.value?.workflowVersionId],
  async (db, [versionId]) => {
    if (!versionId) return null
    return db.WorkflowVersion.findByPk(versionId)
  },
)

const workflow = useLiveQueryWithDeps(
  [() => workflowVersion.value?.workflowId],
  async (db, [workflowId]) => {
    if (!workflowId) return null
    return db.Workflow.findByPk(workflowId)
  },
)

// All steps under this CAPA's workflow instance (roots + children).
const allSteps = useLiveQueryWithDeps(
  [() => workflowInstance.value?.id],
  async (db, [instanceId]) => {
    if (!instanceId) return []
    return db.WorkflowInstanceStep.where('workflowInstanceId', instanceId)
      .orderBy('stepNumber', 'asc')
      .exec()
  },
  { initial: [] },
)

const rootSteps = computed(() => allSteps.value.filter((s) => !s.parentInstanceStepId))
function childrenOf(parentId) {
  return allSteps.value
    .filter((s) => s.parentInstanceStepId === parentId)
    .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0))
}

const allStepIds = computed(() => allSteps.value.map((s) => s.id))

// Per-step assignment rows so each step prints its reviewer.
const allAssignments = useLiveQueryWithDeps(
  [() => allStepIds.value.join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return []
    const ids = idsStr.split(',')
    const fetched = await Promise.all(
      ids.map((id) => db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()),
    )
    return fetched.flat()
  },
  { initial: [] },
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

// Submitted CapaRecord per step (the assignee's form answers).
const allRecords = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const all = await db.CapaRecord.where('capaId', id).exec()
    return all.filter((r) => r.submittedAt)
  },
  { initial: [] },
)

function recordsForStep(stepId) {
  return allRecords.value.filter((r) => r.workflowInstanceStepId === stepId)
}

// Resolve user display names — owner, assignees, capa creator.
const userIds = computed(() => {
  const set = new Set()
  if (capa.value?.ownerId) set.add(capa.value.ownerId)
  if (capa.value?.createdBy) set.add(capa.value.createdBy)
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
  { initial: {} },
)

function userName(id) {
  return id ? (userMap.value[id] ?? id) : '—'
}

// Resolve type / priority / site / department / source labels via their
// respective stores. Each is a quick findByPk live query.
const capaType = useLiveQueryWithDeps([() => capa.value?.typeId], async (db, [id]) =>
  id ? db.CapaType.findByPk(id) : null,
)
const capaPriority = useLiveQueryWithDeps([() => capa.value?.priorityId], async (db, [id]) =>
  id ? db.CapaPriority.findByPk(id) : null,
)
const capaSite = useLiveQueryWithDeps([() => capa.value?.siteId], async (db, [id]) =>
  id ? db.Site.findByPk(id) : null,
)
const capaDepartment = useLiveQueryWithDeps([() => capa.value?.departmentId], async (db, [id]) =>
  id ? db.Department.findByPk(id) : null,
)
const capaStatus = useLiveQueryWithDeps([() => capa.value?.statusId], async (db, [id]) =>
  id ? db.CapaStatus.findByPk(id) : null,
)

// Effectiveness checks for the appendix.
const effectivenessChecks = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const all = await db.CapaEffectivenessCheck.where('capaId', id).exec()
    return all.sort((a, b) => (a.dueAt?.toMillis?.() ?? 0) - (b.dueAt?.toMillis?.() ?? 0))
  },
  { initial: [] },
)

const identifier = computed(() => capa.value?.capaNumber ?? '')

const auditEntities = computed(() => {
  const out = []
  if (capa.value?.id) out.push({ entityType: 'Capas', entityId: capa.value.id })
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

const ready = computed(() => !!capa.value)

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
  <PrintLayout
    :status="capa?.statusId"
    :identifier="identifier"
    :auditEntities="auditEntities"
  >
    <template #title>
      <div class="capa-print-num">{{ capa?.capaNumber }}</div>
      <h1 class="capa-print-title">{{ capa?.title }}</h1>
      <table class="capa-print-meta">
        <tbody>
          <tr>
            <th>CAPA Number</th>
            <td>{{ capa?.capaNumber || '—' }}</td>
            <th>Status</th>
            <td>{{ capaStatus?.name || capa?.statusId || '—' }}</td>
          </tr>
          <tr>
            <th>Type</th>
            <td>{{ capaType?.name || capa?.typeId || '—' }}</td>
            <th>Priority</th>
            <td>{{ capaPriority?.name || capa?.priorityId || '—' }}</td>
          </tr>
          <tr>
            <th>Site</th>
            <td>{{ capaSite?.name || '—' }}</td>
            <th>Department</th>
            <td>{{ capaDepartment?.name || '—' }}</td>
          </tr>
          <tr>
            <th>Owner</th>
            <td>{{ userName(capa?.ownerId) }}</td>
            <th>Initiated By</th>
            <td>{{ userName(capa?.createdBy) }}</td>
          </tr>
          <tr>
            <th>Initiated</th>
            <td>{{ fmtDate(capa?.initiatedAt) }}</td>
            <th>Due Date</th>
            <td>{{ fmtDate(capa?.dueDate) }}</td>
          </tr>
          <tr v-if="capa?.cancelledAt || capa?.closedAt || capa?.verifiedAt">
            <th>Verified</th>
            <td>{{ fmtDateTime(capa?.verifiedAt) }}</td>
            <th>{{ capa?.cancelledAt ? 'Cancelled' : 'Closed' }}</th>
            <td>{{ fmtDateTime(capa?.cancelledAt || capa?.closedAt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="workflow" class="capa-print-workflow">
        Workflow: <strong>{{ workflow.name }}</strong>
        <span v-if="workflowVersion">
          (v{{ workflowVersion.versionLabel || `${workflowVersion.versionMajor ?? 1}.${workflowVersion.versionMinor ?? 0}` }})
        </span>
      </div>
    </template>

    <div v-if="!ready" class="tw:py-10 tw:text-secondary tw:text-center">Loading CAPA…</div>
    <div v-else class="capa-print-body">
      <!-- Problem description -->
      <section v-if="capa?.description" class="capa-print-section">
        <h2>1. Problem Description</h2>
        <p class="capa-print-paragraph">{{ capa.description }}</p>
      </section>

      <!-- Workflow steps (root level) -->
      <section v-if="rootSteps.length" class="capa-print-section">
        <h2>2. Action Plan &amp; Execution</h2>
        <p class="capa-print-paragraph capa-print-note">
          The {{ rootSteps.length }} step{{ rootSteps.length === 1 ? '' : 's' }} executed for this
          CAPA, including sub-tasks, assignees, completion, and any form data captured.
        </p>
        <div v-for="(step, idx) in rootSteps" :key="step.id" class="capa-print-step">
          <div class="capa-print-step-head">
            <div class="capa-print-step-num">{{ idx + 1 }}</div>
            <div class="capa-print-step-meta">
              <div class="capa-print-step-title">{{ step.name || 'Step' }}</div>
              <div class="capa-print-step-detail">
                Status: <strong>{{ step.statusId }}</strong>
                · Assignee: <strong>{{ userName(assigneeIdFor(step.id)) }}</strong>
                <template v-if="step.completedAt">
                  · Completed {{ fmtDateTime(step.completedAt) }}
                </template>
              </div>
            </div>
          </div>
          <div v-if="step.description" class="capa-print-step-instructions">
            <span class="capa-print-step-label">Instructions:</span>
            <span v-html="step.description" />
          </div>
          <!-- Submitted form records -->
          <div
            v-for="record in recordsForStep(step.id)"
            :key="record.id"
            class="capa-print-record"
          >
            <div class="capa-print-record-head">
              <strong>{{ userName(record.userId) }}</strong>
              submitted {{ fmtDateTime(record.submittedAt) }}
            </div>
            <FormSchemaReadonlyView
              v-if="record.payload && Object.keys(record.payload).length"
              :fields="step.formSchema || []"
              :values="record.payload"
            />
          </div>
          <!-- Children -->
          <div v-if="childrenOf(step.id).length" class="capa-print-children">
            <div class="capa-print-children-label">Sub-tasks</div>
            <div
              v-for="(child, ci) in childrenOf(step.id)"
              :key="child.id"
              class="capa-print-child"
            >
              <div class="capa-print-child-head">
                <strong>{{ idx + 1 }}.{{ ci + 1 }}</strong>
                {{ child.name || 'Sub-task' }}
                · {{ child.statusId }}
                · Assignee: {{ userName(assigneeIdFor(child.id)) }}
                <template v-if="child.completedAt">
                  · Completed {{ fmtDateTime(child.completedAt) }}
                </template>
              </div>
              <div v-if="child.description" class="capa-print-step-instructions">
                <span class="capa-print-step-label">Instructions:</span>
                <span v-html="child.description" />
              </div>
              <div
                v-for="record in recordsForStep(child.id)"
                :key="record.id"
                class="capa-print-record"
              >
                <div class="capa-print-record-head">
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

      <!-- Effectiveness checks appendix -->
      <section v-if="effectivenessChecks.length" class="capa-print-section">
        <h2>3. Effectiveness Checks</h2>
        <table class="capa-print-effectiveness">
          <thead>
            <tr>
              <th>Due</th>
              <th>Status</th>
              <th>Completed</th>
              <th>Comments</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="check in effectivenessChecks" :key="check.id">
              <td>{{ fmtDate(check.dueAt) }}</td>
              <td>{{ check.statusId }}</td>
              <td>{{ fmtDateTime(check.completedAt) }}</td>
              <td>{{ check.comments || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Cancellation reason appendix -->
      <section v-if="capa?.cancelReason" class="capa-print-section">
        <h2>Cancellation Reason</h2>
        <p class="capa-print-paragraph">{{ capa.cancelReason }}</p>
      </section>
    </div>
  </PrintLayout>
</template>

<style>
.capa-print-num {
  font-size: 11px;
  color: #6b7280;
  font-family: ui-monospace, SFMono-Regular, monospace;
  letter-spacing: 0.5px;
}
.capa-print-title {
  font-size: 22px;
  font-weight: 700;
  margin: 4px 0 14px;
  line-height: 1.25;
  color: var(--print-accent, #111827);
}
.capa-print-meta {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.capa-print-meta th {
  text-align: left;
  background: #f9fafb;
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  font-weight: 600;
  width: 16%;
}
.capa-print-meta td {
  padding: 6px 10px;
  border: 1px solid #e5e7eb;
  width: 34%;
}
.capa-print-workflow {
  font-size: 11px;
  color: #4b5563;
  margin-top: 10px;
}

.capa-print-body { font-size: 11px; }
.capa-print-section { margin: 18px 0; break-inside: avoid-page; }
.capa-print-section > h2 {
  font-size: 14px;
  font-weight: 700;
  margin: 0 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e5e7eb;
  color: var(--print-accent, #111827);
}
.capa-print-paragraph { line-height: 1.5; }
.capa-print-note { color: #6b7280; font-size: 10px; }

.capa-print-step {
  margin: 10px 0 14px;
  padding: 8px 10px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  break-inside: avoid-page;
}
.capa-print-step-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.capa-print-step-num {
  width: 22px;
  height: 22px;
  border-radius: 11px;
  background: #eef2ff;
  color: #3730a3;
  font-weight: 700;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.capa-print-step-title { font-weight: 700; font-size: 12px; }
.capa-print-step-detail { color: #4b5563; font-size: 10px; margin-top: 2px; }
.capa-print-step-instructions {
  margin: 8px 0 4px 32px;
  font-size: 10.5px;
  color: #374151;
  line-height: 1.5;
}
.capa-print-step-label {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 9px;
  letter-spacing: 0.3px;
  color: #6b7280;
  margin-right: 4px;
}

.capa-print-record {
  margin: 8px 0 4px 32px;
  padding: 6px 8px;
  background: #f9fafb;
  border-left: 2px solid #d1d5db;
  font-size: 10px;
  break-inside: avoid-page;
}
.capa-print-record-head { color: #4b5563; margin-bottom: 4px; }
.capa-print-payload {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
}
.capa-print-payload th {
  text-align: left;
  background: #fff;
  border: 1px solid #e5e7eb;
  padding: 4px 6px;
  font-weight: 600;
  width: 30%;
}
.capa-print-payload td {
  border: 1px solid #e5e7eb;
  padding: 4px 6px;
}

.capa-print-children {
  margin: 10px 0 0 32px;
  padding-top: 6px;
  border-top: 1px dashed #e5e7eb;
}
.capa-print-children-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 4px;
}
.capa-print-child {
  margin: 4px 0 6px;
  padding-left: 8px;
  border-left: 2px solid #e5e7eb;
}
.capa-print-child-head { font-size: 10.5px; }

.capa-print-effectiveness {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
}
.capa-print-effectiveness th,
.capa-print-effectiveness td {
  border: 1px solid #e5e7eb;
  padding: 5px 8px;
  text-align: left;
}
.capa-print-effectiveness th {
  background: #f9fafb;
  font-weight: 600;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: #6b7280;
}
</style>
