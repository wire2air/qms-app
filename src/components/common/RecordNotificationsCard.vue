<script setup>
/**
 * Notifications for one record: who gets told, who else the rules will tell,
 * and when anything was last sent.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The cc picker alone answered only "who did I add". It could not answer the
 * three questions people actually had: WHEN does this fire, WHO ELSE gets it
 * because of a rule set up centrally, and DID ANYTHING ACTUALLY GO OUT. Two of
 * those made the list misleading rather than merely incomplete — a per-record
 * list that hides the rules reads as the whole picture.
 *
 * ── It is all reads ─────────────────────────────────────────────────────────
 * Nothing here is a new subsystem: the rules, the sent notifications and the
 * external share links all already exist. This card puts them in one place.
 * The status half lives in [[RecordNotificationStatus]] so Quality Events —
 * whose notify surface is a manual action in the body, not a rail card — show
 * the same facts without a second, disagreeing notify surface.
 */
import { useTooltipData } from '@shared/composables/useTooltipData.js'

const props = defineProps({
  /** Task/notification entity type, e.g. 'Nonconformance'. */
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  /** Used to decide which site/department-scoped rules apply. */
  siteId: { type: String, default: null },
  departmentId: { type: String, default: null },
  editable: { type: Boolean, default: false },
})

const groupIds = defineModel('groupIds', { type: Array, default: () => [] })
const userIds = defineModel('userIds', { type: Array, default: () => [] })
const emails = defineModel('emails', { type: Array, default: () => [] })

const { getFromTooltipData } = useTooltipData()
const help = getFromTooltipData('record.notifications', 'tooltip')
</script>

<template>
  <BaseRailCard title="Notifications" :titleHelp="help">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <NotificationCcField
        v-model:groupIds="groupIds"
        v-model:userIds="userIds"
        v-model:emails="emails"
        :editable="props.editable"
        hint=""
      />

      <RecordNotificationStatus
        :entityType="props.entityType"
        :entityId="props.entityId"
        :siteId="props.siteId"
        :departmentId="props.departmentId"
        :externalCount="emails?.length ?? 0"
      />
    </div>
  </BaseRailCard>
</template>
