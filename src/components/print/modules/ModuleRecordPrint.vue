<script setup>
import '../recordPrint.css'
import FormSchemaReadonlyView from '@/components/form/FormSchemaReadonlyView.vue'

/**
 * Admin-defined module record print (user request 2026-08-26) — ONE module
 * for every promoted form module (Deviation, …): the record's moduleKey is on
 * the row, the layout comes from its template's schema, so nothing here is
 * per-module.
 *
 * Self-contained like every registry entry: fetches the record + template +
 * section workflow via SyncEngine, wraps PrintLayout for the shared chrome.
 * Printed order mirrors the detail page — envelope, owner-level information,
 * then the routed sections as workflow steps with their submitted answers.
 *
 * Answers come from TWO places, deliberately: record.payload holds the
 * owner-level fields (and the assembled section answers once the handler
 * seals them on completion), while ModuleSectionRecord rows carry each
 * section's submission while the workflow is still running. Each routed
 * section prints its OWN submissions, so an in-flight record prints what has
 * actually been captured so far rather than a blank.
 */
const props = defineProps({
  id: { type: String, default: null },
})

const record = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => (id ? db.Record.findByPk(id) : null),
  { models: ['Record'] },
)

const template = useLiveQueryWithDeps(
  [() => record.value?.templateId],
  async (db, [tid]) => (tid ? db.FormTemplate.findByPk(tid) : null),
  { models: ['FormTemplate'] },
)

const isRoutedSection = (f) => f.type === 'section' && f.routing && f.routing.type
// Frozen at Start when the record has a snapshot; the live template otherwise.
const schema = computed(() => record.value?.schemaSnapshot || template.value?.schema || [])
const ownerFields = computed(() => schema.value.filter((f) => !isRoutedSection(f)))

const moduleName = computed(
  () => template.value?.moduleConfig?.displayName || template.value?.title || 'Module record',
)

// ── Section workflow (synthesized per record at Start) ───────────────────────
const workflowInstance = useLiveQueryWithDeps(
  [() => record.value?.workflowInstanceId],
  async (db, [id]) => (id ? db.WorkflowInstance.findByPk(id) : null),
  { models: ['WorkflowInstance'] },
)

const steps = useLiveQueryWithDeps(
  [() => workflowInstance.value?.id],
  async (db, [instanceId]) => {
    if (!instanceId) return []
    const all = await db.WorkflowInstanceStep.where('workflowInstanceId', instanceId)
      .orderBy('stepNumber', 'asc')
      .exec()
    // Latest instance per template step (send-back churn), roots only —
    // the same collapse GenericModuleWorkflowDetail applies.
    const latest = new Map()
    for (const s of all) {
      const prev = latest.get(s.stepId)
      if (!prev || s.createdAt > prev.createdAt) latest.set(s.stepId, s)
    }
    return [...latest.values()]
      .filter((s) => !s.parentInstanceStepId)
      .sort((a, b) => a.stepNumber - b.stepNumber)
  },
  { models: ['WorkflowInstanceStep'], initial: [] },
)

// Per-section submissions, newest last, grouped by instance step.
const sectionRecords = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.ModuleSectionRecord.where('recordId', id).exec()
    return rows.sort(
      (a, b) => (a.submittedAt?.toMillis?.() ?? 0) - (b.submittedAt?.toMillis?.() ?? 0),
    )
  },
  { models: ['ModuleSectionRecord'], initial: [] },
)

function recordsForStep(stepInstanceId) {
  return sectionRecords.value.filter(
    (r) => r.workflowInstanceStepId === stepInstanceId && r.submittedAt,
  )
}

// Assignee per step: the live task wins, planned assignment rows otherwise —
// mirrors WorkflowStepRun's ownership rule.
const stepIdKey = computed(() => steps.value.map((s) => s.id).join(','))
const assigneeByStep = useLiveQueryWithDeps(
  [() => stepIdKey.value],
  async (db, [key]) => {
    if (!key) return {}
    const out = {}
    for (const id of key.split(',')) {
      const tasks = await db.TaskInstance.where('[sourceType+sourceId]', [
        'WorkflowInstanceStep',
        id,
      ]).exec()
      const live = tasks.filter(
        (t) => t.assignedTo && !['REASSIGNED', 'CANCELLED'].includes(t.statusId),
      )
      if (live.length) {
        out[id] = live[0].assignedTo
        continue
      }
      const rows = await db.UserOnWorkflowInstanceStep.where('workflowInstanceStepId', id).exec()
      out[id] = rows[0]?.userId ?? null
    }
    return out
  },
  { models: ['TaskInstance', 'UserOnWorkflowInstanceStep'], initial: {} },
)

// ── Names for everyone/everything the printout mentions ──────────────────────
// Paper has no tooltips: an unresolved id is simply wrong on the page.
const userIds = computed(() => {
  const ids = new Set()
  if (record.value?.ownerUserId) ids.add(record.value.ownerUserId)
  if (record.value?.userId) ids.add(record.value.userId)
  for (const id of Object.values(assigneeByStep.value)) if (id) ids.add(id)
  for (const r of sectionRecords.value) if (r.userId) ids.add(r.userId)
  return [...ids]
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

const related = useLiveQueryWithDeps(
  [() => record.value?.siteId, () => record.value?.departmentId, () => record.value?.supplierId],
  async (db, [siteId, departmentId, supplierId]) => ({
    site: siteId ? ((await db.Site.findByPk(siteId))?.name ?? null) : null,
    department: departmentId ? ((await db.Department.findByPk(departmentId))?.name ?? null) : null,
    supplier: supplierId ? ((await db.Supplier.findByPk(supplierId))?.name ?? null) : null,
  }),
  { models: ['Site', 'Department', 'Supplier'], initial: {} },
)

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v)

function fmtDateTime(d) {
  if (!d) return '—'
  if (typeof d?.toFormat === 'function') return d.toFormat('LLL d, yyyy HH:mm')
  return new Date(d).toLocaleString()
}

function effectivenessLabel(v) {
  if (v === 'EFFECTIVE') return 'Effective'
  if (v === 'NOT_EFFECTIVE') return 'Not effective'
  return null
}

const identifier = computed(() => record.value?.recordNumber ?? '')

const auditEntities = computed(() => {
  const out = []
  if (record.value?.id) out.push({ entityType: 'Records', entityId: record.value.id })
  if (workflowInstance.value?.id) {
    out.push({ entityType: 'WorkflowInstances', entityId: workflowInstance.value.id })
  }
  for (const s of steps.value) out.push({ entityType: 'WorkflowInstanceSteps', entityId: s.id })
  return out
})

// Same guard as the other modules: never fire the dialog on an empty page.
const ready = computed(() => !!record.value && !!template.value)

onMounted(() => {
  const tryPrint = (attempts = 0) => {
    if (ready.value) {
      setTimeout(() => window.print(), 300)
      return
    }
    if (attempts < 20) setTimeout(() => tryPrint(attempts + 1), 200)
  }
  tryPrint()
})
</script>

<template>
  <PrintLayout :status="record?.statusId" :identifier="identifier" :auditEntities="auditEntities">
    <template #title>
      <div class="qp-num">{{ record?.recordNumber }}</div>
      <h1 class="qp-title">{{ moduleName }}</h1>
      <table class="qp-meta">
        <tbody>
          <tr>
            <th>Record number</th>
            <td>{{ dash(record?.recordNumber) }}</td>
            <th>Status</th>
            <td>{{ dash(record?.statusId) }}</td>
          </tr>
          <tr>
            <th>Site</th>
            <td>{{ dash(related.site) }}</td>
            <th>Department</th>
            <td>{{ dash(related.department) }}</td>
          </tr>
          <tr>
            <th>Owner</th>
            <td>{{ userName(record?.ownerUserId) }}</td>
            <th>Created by</th>
            <td>{{ userName(record?.userId) }}</td>
          </tr>
          <tr>
            <th>Created</th>
            <td>{{ fmtDateTime(record?.createdAt) }}</td>
            <th>Supplier</th>
            <td>{{ dash(related.supplier) }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <div v-if="!ready" class="tw:py-10 tw:text-secondary tw:text-center">Loading record…</div>
    <div v-else class="qp-body">
      <!-- Owner-level fields (the non-routed part of the template) -->
      <section v-if="ownerFields.length" class="qp-section">
        <h2>1. Record Information</h2>
        <FormSchemaReadonlyView :fields="ownerFields" :values="record?.payload || {}" />
      </section>

      <!-- Routed sections = the section workflow, with captured answers -->
      <section v-if="steps.length" class="qp-section">
        <h2>{{ ownerFields.length ? 2 : 1 }}. Sections &amp; Execution</h2>
        <div v-for="(step, idx) in steps" :key="step.id" class="qp-step">
          <div class="qp-step-head">
            <div class="qp-step-num">{{ idx + 1 }}</div>
            <div class="qp-step-meta">
              <div class="qp-step-title">{{ step.name || 'Section' }}</div>
              <div class="qp-step-detail">
                Status: <strong>{{ step.statusId }}</strong> · Assignee:
                <strong>{{ userName(assigneeByStep[step.id]) }}</strong>
                <template v-if="step.completedAt">
                  · Completed {{ fmtDateTime(step.completedAt) }}
                </template>
                <template v-if="effectivenessLabel(step.effectivenessOutcome)">
                  · Effectiveness:
                  <strong>{{ effectivenessLabel(step.effectivenessOutcome) }}</strong>
                </template>
              </div>
            </div>
          </div>
          <div v-if="step.description" class="qp-step-instructions">
            <span class="qp-step-label">Instructions:</span>
            <span>{{ step.description }}</span>
          </div>
          <div v-for="sub in recordsForStep(step.id)" :key="sub.id" class="qp-record">
            <div class="qp-record-head">
              <strong>{{ userName(sub.userId) }}</strong>
              submitted {{ fmtDateTime(sub.submittedAt) }}
            </div>
            <FormSchemaReadonlyView
              v-if="sub.payload && Object.keys(sub.payload).length"
              :fields="step.formSchema || []"
              :values="sub.payload"
            />
          </div>
        </div>
      </section>
    </div>
  </PrintLayout>
</template>
