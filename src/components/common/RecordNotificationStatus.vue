<script setup>
/**
 * The two things a recipient list cannot tell you: who ELSE gets notified, and
 * whether anything has actually gone out.
 *
 * Split out of [[RecordNotificationsCard]] because Quality Events answer the
 * same questions in a different place — their notify surface is a manual "Notify
 * Selected Parties" action in the body, not a passive rail card, and a record
 * should not have two notify surfaces that disagree.
 *
 * Everything here is a READ of data that already exists. Rules live in
 * `automationRules` / `notificationRules`; in-app sends leave a `notifications`
 * row; external sends leave a share link stamped `origin = 'NOTIFICATION'`.
 */
import { IconBell, IconClock } from '@tabler/icons-vue'

const props = defineProps({
  /** Task/notification entity type, e.g. 'Nonconformance'. */
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  /** Used to decide which site/department-scoped rules apply. */
  siteId: { type: String, default: null },
  departmentId: { type: String, default: null },
  /** How many outside addresses are on the record's own cc list. */
  externalCount: { type: Number, default: 0 },
})

/** Only notify-shaped actions matter here; CREATE_NC and friends do not. */
const NOTIFY_ACTIONS = new Set([
  'NOTIFY_GROUP',
  'NOTIFY_USER',
  'NOTIFY_REQUESTER',
  'NOTIFY_OWNER',
  'NOTIFY_EMAIL',
  'NOTIFY_SUPPLIER',
])

/**
 * Rules that reach this record.
 *
 * Scope is filtered the way the engine filters it: an empty `siteIds` means
 * every site, a populated one means only those. Being permissive here would
 * list rules that can never fire for this record — the same lie as hiding
 * them, pointing the other way.
 */
const automationRules = useLiveQueryWithDeps(
  [() => props.entityType, () => props.siteId, () => props.departmentId],
  async (db, [entityType, siteId, departmentId]) => {
    const rows = await db.AutomationRule.where('objectType', entityType).exec()
    return rows.filter((r) => {
      if (!r.isActive) return false
      if (!(r.actions || []).some((a) => NOTIFY_ACTIONS.has(a?.type))) return false
      if (r.siteIds?.length && !r.siteIds.includes(siteId)) return false
      if (r.departmentIds?.length && !r.departmentIds.includes(departmentId)) return false
      return true
    })
  },
  { models: ['AutomationRule'], initial: [] },
)

/** Company-wide standing recipients for this record type. */
const notificationRule = useLiveQueryWithDeps(
  [() => props.entityType],
  async (db, [entityType]) => {
    const rows = await db.NotificationRule.where('entityType', entityType).exec()
    return rows.find((r) => r.isActive) ?? null
  },
  { models: ['NotificationRule'] },
)

const ruleRecipientCount = computed(() => {
  const r = notificationRule.value?.recipients
  return (r?.userIds?.length ?? 0) + (r?.groupIds?.length ?? 0)
})

/**
 * A rule with conditions is listed as a MAYBE.
 *
 * Evaluating a condition tree here would be a second implementation of the
 * worker's job, run against the record as it is now rather than as it will be
 * when the trigger fires. Promising mail that never arrives is the failure this
 * whole card exists to end.
 */
function hasConditions(rule) {
  const tree = rule.conditionTree
  return Array.isArray(tree?.conditions) ? tree.conditions.length > 0 : !!tree?.field
}

const lastNotification = useLiveQueryWithDeps(
  [() => props.entityId],
  async (db, [entityId]) => {
    // `notifications` declares no custom index, so resourceId cannot be
    // queried directly — every other caller scans and filters, and so does
    // this one.
    const rows = await db.Notification.where().exec()
    return (
      rows
        .filter((n) => n.resourceId === entityId)
        .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
    )
  },
  { models: ['Notification'] },
)

/**
 * External sends leave no `notifications` row — send_notification emails the
 * address and returns before creating one. The share link it mints is that
 * send's only trace, so it counts as a send here.
 */
const ruleSentLinks = useLiveQueryWithDeps(
  [() => props.entityType, () => props.entityId],
  async (db, [entityType, entityId]) =>
    // Compound index — see RecordShareCard for why the first where() cannot
    // name entityId on its own.
    (await db.RecordShareLink.where('[entityType+entityId]', [entityType, entityId]).exec()).filter(
      (l) => l.origin === 'NOTIFICATION',
    ),
  { models: ['RecordShareLink'], initial: [] },
)

const lastSent = computed(() => {
  const candidates = []
  if (lastNotification.value?.createdAt) {
    candidates.push({ at: lastNotification.value.createdAt, what: lastNotification.value.title })
  }
  for (const link of ruleSentLinks.value || []) {
    if (link.createdAt) candidates.push({ at: link.createdAt, what: `Link sent to ${link.email}` })
  }
  return candidates.sort((a, b) => b.at - a.at)[0] ?? null
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <!-- Shown whether or not the cc list is empty: "nobody" and "nobody except
         these three rules" are very different answers. -->
    <div
      v-if="automationRules?.length || ruleRecipientCount"
      class="tw:border-t tw:border-divider tw:pt-3"
    >
      <BaseText color="secondary" class="tw:mb-1.5 tw:flex tw:items-center tw:gap-1 tw:text-xs">
        <IconBell :size="12" />
        Also notified by rules
      </BaseText>

      <div class="tw:flex tw:flex-col tw:gap-1">
        <BaseText v-if="ruleRecipientCount" class="tw:text-xs">
          {{ ruleRecipientCount }} standing
          {{ ruleRecipientCount === 1 ? 'recipient' : 'recipients' }} for every record of this type
        </BaseText>

        <BaseText v-for="rule in automationRules" :key="rule.id" class="tw:text-xs">
          {{ rule.name }}
          <BaseText v-if="hasConditions(rule)" color="secondary" class="tw:text-xs">
            — if its conditions match
          </BaseText>
        </BaseText>
      </div>
    </div>

    <!-- "Nothing sent yet" is a real answer, and the right one for a draft. -->
    <div class="tw:border-t tw:border-divider tw:pt-3">
      <BaseText color="secondary" class="tw:mb-1.5 tw:flex tw:items-center tw:gap-1 tw:text-xs">
        <IconClock :size="12" />
        Last sent
      </BaseText>
      <template v-if="lastSent">
        <BaseText class="tw:text-xs">{{ lastSent.at.formatDate('datetime') }}</BaseText>
        <BaseText color="secondary" class="tw:block tw:truncate tw:text-xs">
          {{ lastSent.what }}
        </BaseText>
      </template>
      <BaseText v-else color="secondary" class="tw:text-xs">
        Nothing sent yet — notices go out when this record is opened and when it is closed.
      </BaseText>
    </div>

    <BaseText
      v-if="props.externalCount"
      color="secondary"
      class="tw:border-t tw:border-divider tw:pt-3 tw:text-xs"
    >
      {{ props.externalCount }} external
      {{ props.externalCount === 1 ? 'address receives' : 'addresses receive' }} a secure link to a
      read-only summary, opened with an emailed code. Manage or withdraw it under
      <strong>Share externally</strong>.
    </BaseText>
  </div>
</template>
