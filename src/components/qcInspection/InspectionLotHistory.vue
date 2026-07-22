<script setup>
/**
 * History / audit timeline for an inspection lot — the visible record of
 * significant actions (currently reopen-for-re-inspection). Reads
 * InspectionLotEvent live; each entry shows the actor, time, reason, and the
 * status / specification / sampling-plan change. Rendered as a collapsed rail
 * card at the bottom of the lot's right rail.
 */
import { IconHistory } from '@tabler/icons-vue'

const props = defineProps({ lotId: { type: String, required: true } })

const events = useLiveQueryWithDeps(
  [() => props.lotId],
  async (db, [id]) =>
    id
      ? db.InspectionLotEvent.where('inspectionLotId', id).orderBy('createdAt', 'desc').exec()
      : [],
  { models: ['InspectionLotEvent'], initial: [] },
)

// Resolve spec / sampling-plan names for the from→to change lines.
const specs = useLiveQuery((db) => db.Specification.where().exec(), {
  models: ['Specification'],
  initial: [],
})
const plans = useLiveQuery((db) => db.SamplingPlan.where().exec(), {
  models: ['SamplingPlan'],
  initial: [],
})
const specName = (id) => (id ? specs.value.find((s) => s.id === id)?.name || '—' : '—')
const planName = (id) => (id ? plans.value.find((p) => p.id === id)?.name || '—' : '—')
// The "to" sampling label: an ad-hoc AQL override has no plan id, so read its
// label from the event payload.
const samplingTo = (e) => e.payload?.samplingOverride?.label || planName(e.toSamplingPlanId)
const samplingChanged = (e) =>
  e.toSamplingPlanId !== e.fromSamplingPlanId || !!e.payload?.samplingOverride

const EVENT_LABEL = {
  LOT_CREATED: 'Inspection created',
  CHECKED_IN: 'Inspector checked in',
  CHECKED_OUT: 'Inspector checked out',
  BATCH_ADDED: 'Production lot added',
  BATCH_CLOSED: 'Production lot closed',
  ACTIVE_BATCH_CHANGED: 'Active production lot changed',
  SAMPLES_COLLECTED: 'Samples collected',
  SAMPLE_REASSIGNED: 'Sample moved to another lot',
  LINE_CLEARANCE_PASSED: 'Line clearance passed',
  LINE_CLEARANCE_FAILED: 'Line clearance failed',
  STARTED: 'Inspection started',
  COMPLETED: 'Inspection completed',
  SUBMITTED_FOR_REVIEW: 'Submitted for QA disposition',
  REOPENED: 'Reopened for re-inspection',
}
const EVENT_COLOR = {
  LOT_CREATED: 'primary',
  CHECKED_IN: 'success',
  CHECKED_OUT: 'neutral',
  BATCH_ADDED: 'info',
  BATCH_CLOSED: 'neutral',
  ACTIVE_BATCH_CHANGED: 'info',
  SAMPLES_COLLECTED: 'info',
  SAMPLE_REASSIGNED: 'warning',
  LINE_CLEARANCE_PASSED: 'success',
  LINE_CLEARANCE_FAILED: 'danger',
  STARTED: 'info',
  COMPLETED: 'success',
  SUBMITTED_FOR_REVIEW: 'primary',
  REOPENED: 'warning',
}

// One-line detail per event type (beyond the reason / from→to lines below).
function payloadSummary(e) {
  const p = e.payload || {}
  switch (e.eventType) {
    case 'SAMPLES_COLLECTED':
      return `${p.count} sample${p.count === 1 ? '' : 's'} (#${p.fromSampleNo}–#${p.toSampleNo})`
    case 'BATCH_ADDED':
    case 'BATCH_CLOSED':
      return `Lot ${p.lotNumber || '—'}`
    case 'SAMPLE_REASSIGNED':
      return `Sample #${p.sampleNo} moved to a different production lot`
    case 'CHECKED_IN':
      return p.previousInspector ? 'Took over from the previous inspector' : 'Claimed the inspection'
    default:
      return ''
  }
}

const items = computed(() =>
  (events.value || []).map((e) => ({
    id: e.id,
    color: EVENT_COLOR[e.eventType] || 'neutral',
    title: EVENT_LABEL[e.eventType] || e.eventType,
    time: e.createdAt ? e.createdAt.formatDate('datetime') : '',
    event: e,
  })),
)
</script>

<template>
  <BaseRailCard v-if="items.length" title="History" :icon="IconHistory" :defaultOpen="false">
    <BaseTimeline :items="items">
      <template #item="{ item }">
        <div class="tw:flex tw:items-start tw:justify-between tw:gap-2">
          <div class="tw:font-medium tw:text-on-main">{{ item.title }}</div>
          <div class="tw:text-xs tw:text-secondary tw:shrink-0">{{ item.time }}</div>
        </div>

        <div class="tw:mt-0.5 tw:text-xs tw:text-secondary tw:flex tw:items-center tw:gap-1">
          <span>by</span>
          <UserBadgeById v-if="item.event.actorUserId" :userId="item.event.actorUserId" />
          <span v-else>—</span>
        </div>

        <p v-if="payloadSummary(item.event)" class="tw:mt-1 tw:text-xs tw:text-on-main">
          {{ payloadSummary(item.event) }}
        </p>

        <p v-if="item.event.reason" class="tw:mt-1.5 tw:text-sm tw:text-on-main tw:italic">
          "{{ item.event.reason }}"
        </p>

        <div class="tw:mt-2 tw:flex tw:flex-col tw:gap-1 tw:text-xs">
          <div v-if="item.event.fromStatus" class="tw:flex tw:items-center tw:gap-1.5">
            <span class="tw:text-secondary tw:w-24">Status</span>
            <InspectionLotStatusBadgeById :statusId="item.event.fromStatus" />
            <span class="tw:text-secondary">→</span>
            <InspectionLotStatusBadgeById :statusId="item.event.toStatus" />
          </div>
          <div
            v-if="item.event.toSpecificationId !== item.event.fromSpecificationId"
            class="tw:flex tw:items-center tw:gap-1.5"
          >
            <span class="tw:text-secondary tw:w-24">Specification</span>
            <span class="tw:text-on-main">{{ specName(item.event.fromSpecificationId) }}</span>
            <span class="tw:text-secondary">→</span>
            <span class="tw:text-on-main tw:font-medium">
              {{ specName(item.event.toSpecificationId) }}
            </span>
          </div>
          <div v-if="samplingChanged(item.event)" class="tw:flex tw:items-center tw:gap-1.5">
            <span class="tw:text-secondary tw:w-24">Sampling</span>
            <span class="tw:text-on-main">{{ planName(item.event.fromSamplingPlanId) }}</span>
            <span class="tw:text-secondary">→</span>
            <span class="tw:text-on-main tw:font-medium">{{ samplingTo(item.event) }}</span>
          </div>
          <div
            v-if="item.event.payload?.sampleSizeOverride"
            class="tw:flex tw:items-center tw:gap-1.5"
          >
            <span class="tw:text-secondary tw:w-24">Sample size</span>
            <span class="tw:text-on-main">{{ item.event.payload.sampleSizeOverride.computed ?? '—' }} (calc)</span>
            <span class="tw:text-secondary">→</span>
            <span class="tw:text-on-main tw:font-medium">
              {{ item.event.payload.sampleSizeOverride.override }} (manual)
            </span>
          </div>
        </div>
      </template>
    </BaseTimeline>
  </BaseRailCard>
</template>
