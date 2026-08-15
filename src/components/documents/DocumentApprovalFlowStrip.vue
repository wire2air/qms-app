<script setup>
/**
 * The document's approval route, left to right (user request 2026-08-15):
 *
 *     Submitted for Review  →  Technical Review  →  Approval  →  Effective
 *
 * Answers "where is this, and who's next" at a glance. The rail already has a
 * vertical WorkflowInstanceTimeline with per-step comments, signatures and
 * timestamps — this is not that. It is the one-line route, shown above the
 * document body, and it deliberately carries no actions.
 *
 * It renders BEFORE submission too, from the template's workflow steps, so an
 * author can see what will happen to the document before committing to it.
 * Once submitted it switches to the instance's own steps, which is what makes
 * send-backs and skips show up honestly — the plan and the actual route
 * diverge, and after a send-back only the instance knows the truth.
 */
import { IconSend, IconRosetteDiscountCheck } from '@tabler/icons-vue'
import {
  DONE_STATUSES,
  FAILED_STATUSES,
  stepperStatus,
  routeSteps,
} from './documentApprovalRoute.js'

const props = defineProps({
  // The document VERSION being viewed — the workflow runs per version.
  versionId: { type: String, default: null },
  // Falls back to this workflow version's steps before a run exists.
  workflowVersionId: { type: String, default: null },
})

const version = useLiveQueryWithDeps(
  [() => props.versionId],
  async (db, [id]) => (id ? db.DocumentVersion.findByPk(id) : null),
  { models: ['DocumentVersion'], initial: null },
)

const instanceId = computed(() => version.value?.workflowInstanceId ?? null)

// Live run, when there is one.
const instanceSteps = useLiveQueryWithDeps(
  [() => instanceId.value],
  async (db, [id]) => (id ? db.WorkflowInstanceStep.where('workflowInstanceId', id).exec() : []),
  { models: ['WorkflowInstanceStep'], initial: [] },
)

// Planned route, before submission.
const templateSteps = useLiveQueryWithDeps(
  [() => props.workflowVersionId],
  async (db, [id]) =>
    id ? db.WorkflowStep.where('workflowVersionId', id).orderBy('stepOrder').exec() : [],
  { models: ['WorkflowStep'], initial: [] },
)

// A step can be re-instanced by a send-back, leaving several rows for the same
// template step. Only the newest is the current truth — the older rows are
// history and belong in the timeline, not in a one-line route.
const liveSteps = computed(() => routeSteps(instanceSteps.value))

const started = computed(() => liveSteps.value.length > 0)

const steps = computed(() => {
  // Node 1 is the submission itself — the event that starts the route, and the
  // thing the author is looking for confirmation of.
  const out = [
    {
      title: 'Submitted for Review',
      icon: IconSend,
      status: started.value ? 'complete' : 'upcoming',
      description: started.value ? null : 'Not yet submitted',
    },
  ]

  if (started.value) {
    for (const s of liveSteps.value) {
      out.push({
        title: s.name || 'Step',
        status: stepperStatus(s.statusId),
        description: s.statusId === 'SENT_BACK' ? 'Sent back' : null,
      })
    }
  } else {
    for (const s of templateSteps.value) {
      out.push({ title: s.name || 'Step', status: 'upcoming' })
    }
  }

  // Node N is the outcome the route exists to reach.
  const allApproved =
    started.value &&
    liveSteps.value.length > 0 &&
    liveSteps.value.every((s) => DONE_STATUSES.has(s.statusId))
  const isEffective = version.value?.statusId === 'EFFECTIVE'
  out.push({
    title: 'Effective',
    icon: isEffective ? IconRosetteDiscountCheck : undefined,
    status: isEffective ? 'complete' : allApproved ? 'current' : 'upcoming',
  })

  return out
})

// BaseStepper derives status from this index unless a step sets its own; every
// step here sets one, so the index only drives aria-current.
const currentIndex = computed(() => {
  const i = steps.value.findIndex((s) => s.status === 'current' || s.status === 'error')
  return i === -1 ? steps.value.length - 1 : i
})

const rejected = computed(() => liveSteps.value.some((s) => FAILED_STATUSES.has(s.statusId)))
const hasRoute = computed(() => steps.value.length > 2)
</script>

<template>
  <section
    v-if="hasRoute"
    class="tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:p-4 tw:md:p-5"
    :class="rejected ? 'tw:border-red-300' : ''"
  >
    <div class="tw:mb-3 tw:flex tw:items-center tw:gap-2">
      <h3 class="tw:text-label tw:font-semibold tw:text-on-main">Approval Route</h3>
      <span v-if="!started" class="tw:text-xs tw:text-secondary">
        · planned — nothing has been submitted yet
      </span>
    </div>

    <!-- Scrolls inside its own box: a long route must never make the page
         scroll sideways. -->
    <div class="tw:overflow-x-auto">
      <BaseStepper
        :modelValue="currentIndex"
        :steps="steps"
        orientation="horizontal"
        ariaLabel="Document approval route"
        class="tw:min-w-max"
      />
    </div>
  </section>
</template>
