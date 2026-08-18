<script setup>
/**
 * Per-step audit history — who held this step, when, and what they did.
 *
 * A completed step used to show only its end state. While pending you could at
 * least see the current assignee, but once it finished there was nothing: no
 * record of when it was assigned, who it passed through on the way, who
 * actually completed it, or whether they signed. For a QMS that is the first
 * thing an auditor asks for, and the only way to answer it was the record-wide
 * Audit Log dialog — a flat firehose across every step at once (reported
 * 2026-08-18).
 *
 * Two sources, merged into one timeline:
 *
 *   TaskInstance rows  — the assignment ledger. Reassignment does not mutate a
 *                        task, it retires the old row (REASSIGNED) and mints a
 *                        new one, so the rows ARE the chain of custody.
 *   AuditLog rows      — the authoritative acts, including the e-signature
 *                        metadata (method / signedAt) that lives nowhere else
 *                        client-side. `signatures` is not a synced model.
 *
 * Tasks give us "who held it and when"; audit gives us "what was done and was
 * it signed". Neither alone answers the question.
 */
import {
  IconUserPlus,
  IconArrowsExchange,
  IconCheck,
  IconX,
  IconArrowBackUp,
  IconWriting,
  IconClock,
} from '@tabler/icons-vue'

const props = defineProps({
  instanceStepId: { type: String, required: true },
})

const open = ref(false)

const tasks = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    // force: reassigned/superseded rows are the history — excluding
    // soft-deleted ones would erase exactly what this panel exists to show.
    const rows = await db.TaskInstance.where('[sourceType+sourceId]', [
      'WorkflowInstanceStep',
      stepId,
    ]).exec()
    return rows
      .slice()
      .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0))
  },
  { models: ['TaskInstance'], initial: [] },
)

const auditRows = useLiveQueryWithDeps(
  [() => props.instanceStepId],
  async (db, [stepId]) => {
    if (!stepId) return []
    // audit_logs carries BOTH spellings for this table — 'WorkflowInstanceStep'
    // and 'WorkflowInstanceSteps' — depending on which writer produced the row.
    // Querying one silently drops half the history.
    const lists = await Promise.all(
      ['WorkflowInstanceStep', 'WorkflowInstanceSteps'].map((et) =>
        db.AuditLog.where('[entityType+entityId]', [et, stepId]).exec(),
      ),
    )
    return lists.flat()
  },
  { models: ['AuditLog'], initial: [] },
)

// Everyone who appears anywhere in the timeline, resolved in one pass.
const userIds = computed(() => {
  const set = new Set()
  for (const t of tasks.value) {
    if (t.assignedTo) set.add(t.assignedTo)
    if (t.reassignedToUserId) set.add(t.reassignedToUserId)
  }
  for (const a of auditRows.value) if (a.performedBy) set.add(a.performedBy)
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
  return id ? (userMap.value[id] ?? 'Unknown user') : '—'
}

const ICONS = {
  assigned: IconUserPlus,
  reassigned: IconArrowsExchange,
  completed: IconCheck,
  rejected: IconX,
  sent_back: IconArrowBackUp,
  signed: IconWriting,
  scheduled: IconClock,
}

const TONES = {
  completed: 'tw:text-green-600',
  rejected: 'tw:text-red-600',
  sent_back: 'tw:text-amber-600',
  signed: 'tw:text-violet-600',
}

/**
 * Terminal task statuses and how each reads as an event. A task that is still
 * ASSIGNED has no completion entry yet — only its assignment.
 */
const TASK_END_EVENT = {
  APPROVED: { kind: 'completed', label: 'Completed by' },
  REJECTED: { kind: 'rejected', label: 'Rejected by' },
  SENT_BACK: { kind: 'sent_back', label: 'Sent back by' },
  REASSIGNED: { kind: 'reassigned', label: 'Reassigned away from' },
  CANCELLED: { kind: 'rejected', label: 'Cancelled for' },
}

// Audit actions worth showing that the task rows do not already cover.
// Completion/rejection come from the tasks; these are the step-level acts.
const AUDIT_EVENTS = {
  STEP_DELAY_SCHEDULED: { kind: 'scheduled', label: 'Delay scheduled by' },
  STEP_DELAY_EXTENDED: { kind: 'scheduled', label: 'Delay extended by' },
  STEP_DELAY_SKIPPED: { kind: 'sent_back', label: 'Delay skipped by' },
  REOPEN: { kind: 'scheduled', label: 'Reopened by' },
}

const timeline = computed(() => {
  const out = []

  for (const t of tasks.value) {
    out.push({
      at: t.createdAt,
      kind: 'assigned',
      label: 'Assigned to',
      who: userName(t.assignedTo),
      note: t.comment || null,
    })
    const end = TASK_END_EVENT[t.statusId]
    if (end) {
      out.push({
        at: t.completedAt ?? t.updatedAt,
        kind: end.kind,
        label: end.label,
        who: userName(t.assignedTo),
        note:
          t.statusId === 'REASSIGNED' && t.reassignedToUserId
            ? `→ ${userName(t.reassignedToUserId)}`
            : null,
      })
    }
  }

  for (const a of auditRows.value) {
    // The e-signature is the compliance-critical part and lives only here.
    const sig = a.newValueJson?.esignMethod || a.newValueJson?.signedAt
    if (sig) {
      out.push({
        at: a.performedAt,
        kind: 'signed',
        label: 'Signed by',
        who: userName(a.performedBy),
        note: a.newValueJson?.esignMethod ? `${a.newValueJson.esignMethod} e-signature` : null,
      })
    }
    const ev = AUDIT_EVENTS[a.action]
    if (ev) {
      out.push({
        at: a.performedAt,
        kind: ev.kind,
        label: ev.label,
        who: userName(a.performedBy),
        note: null,
      })
    }
  }

  return out
    .filter((e) => e.at)
    .sort((a, b) => (a.at?.toMillis?.() ?? 0) - (b.at?.toMillis?.() ?? 0))
})
</script>

<template>
  <div v-if="timeline.length" class="tw:border-t tw:border-divider tw:pt-2">
    <button
      type="button"
      class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:font-medium tw:text-secondary tw:hover:text-primary"
      :aria-expanded="open"
      @click="open = !open"
    >
      <IconClock :size="14" />
      History
      <span class="tw:text-micro tw:text-secondary">({{ timeline.length }})</span>
    </button>

    <ol v-if="open" class="tw:mt-2 tw:flex tw:flex-col tw:gap-1.5 tw:ps-1">
      <li
        v-for="(e, i) in timeline"
        :key="`${e.kind}-${i}`"
        class="tw:flex tw:items-start tw:gap-2 tw:text-xs"
      >
        <component
          :is="ICONS[e.kind] ?? IconClock"
          :size="14"
          class="tw:mt-0.5 tw:shrink-0"
          :class="TONES[e.kind] ?? 'tw:text-secondary'"
        />
        <!-- One interpolation, not adjacent spans: Vue trims leading
             whitespace inside an element, so "Assigned to" and the name ran
             together. The name still needs its own span to be emphasised. -->
        <span class="tw:min-w-0">
          <span class="tw:text-secondary">{{ e.label }}&nbsp;</span>
          <span class="tw:text-on-main tw:font-medium">{{ e.who }}</span>
          <span class="tw:text-secondary">
            <template v-if="e.note">&nbsp;· {{ e.note }}</template>
            &nbsp;· {{ e.at.formatDate('datetime') }}
          </span>
        </span>
      </li>
    </ol>
  </div>
</template>
