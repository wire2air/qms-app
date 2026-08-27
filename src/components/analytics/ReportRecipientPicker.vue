<script setup>
/**
 * Who a scheduled report goes to — as REFERENCES, which is the only thing this
 * control can express.
 *
 * ── THERE IS NO EMAIL FIELD HERE, AND THERE CANNOT BE ───────────────────────
 * `analytics_report_schedules.recipients` is a jsonb array of
 * `[{ type: 'user'|'team'|'role', id }]`, and
 * `analytics_report_schedules_recipients_chk` WHITELISTS those two keys — so an
 * address is not discouraged in this feature, it is UNREPRESENTABLE, under any
 * key name. This picker is the UI consequence of that, not a stylistic choice:
 * there is nowhere for a typed address to go.
 *
 * The reasoning, from the migration: an email address is a SNAPSHOT OF AN
 * AUTHORISATION DECISION. Storing one records that on the day somebody typed it
 * they believed that person should receive these figures, and then keeps
 * asserting it after they change role, leave, or lose the module — because there
 * is nothing left in the row to re-ask the question about. A reference can be
 * re-asked, and `run_report_schedules` re-asks it at every single firing,
 * dropping anyone who no longer holds `reports_dashboards:export` and recording
 * the drop as `denied_count` on the run.
 *
 * ── WHY GROUPS AND ROLES ARE OFFERED, NOT JUST PEOPLE ───────────────────────
 * Because that is how distribution actually gets maintained: "the Quality
 * Managers" survives a leaver and a named list does not. They expand at SEND
 * time, not save time — expanding here would freeze the membership as it stood
 * the day the schedule was written, which is the address problem again wearing a
 * different hat.
 *
 * ── REUSED, NOT REBUILT ─────────────────────────────────────────────────────
 * The three controls are the app's existing entity selects (CLAUDE.md rules #2
 * and #14): UserSelectMenu, GroupSelectMenu, RoleSelectMenu. Each already draws
 * the right badge, filters to active rows, and knows its own model. NOTE the
 * vocabulary seam: the DB type is `team` and the whole product calls them
 * GROUPS (GroupSelectMenu reads db.Team, GroupBadgeById takes a teamId). The
 * label below follows the product; the stored value follows the schema.
 */
import { IconUsers, IconUsersGroup, IconShieldLock } from '@tabler/icons-vue'
import {
  normaliseRecipients,
  recipientIdsOfType,
  withRecipientIdsOfType,
} from '@/utils/analyticsReportSchedules.js'

defineProps({
  disabled: { type: Boolean, default: false },
})

// [{ type, id }] — normalised on every write so a duplicate or a stray key can
// never reach the constraint.
const recipients = defineModel({ type: Array, default: () => [] })

const userIds = computed(function pickUsers() {
  return recipientIdsOfType(recipients.value, 'user')
})
const teamIds = computed(function pickTeams() {
  return recipientIdsOfType(recipients.value, 'team')
})
const roleIds = computed(function pickRoles() {
  return recipientIdsOfType(recipients.value, 'role')
})

function setIds(type, ids) {
  // BaseSelect hands back null when a multi-select is cleared entirely.
  recipients.value = withRecipientIdsOfType(recipients.value, type, ids ?? [])
}

const total = computed(function count() {
  return normaliseRecipients(recipients.value).length
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <BaseField
      label="People"
      hint="Named individuals. Each one is re-checked for export access every time the report sends."
    >
      <template #default="field">
        <UserSelectMenu
          v-bind="field"
          multiple
          :modelValue="userIds"
          :disabled="disabled"
          nullLabel="— Add a person —"
          @update:modelValue="(v) => setIds('user', v)"
        />
      </template>
    </BaseField>

    <BaseField
      label="Groups"
      hint="Membership is read on the morning it sends, so a new joiner is included and a leaver is not."
    >
      <template #default="field">
        <GroupSelectMenu
          v-bind="field"
          multiple
          :modelValue="teamIds"
          :disabled="disabled"
          nullLabel="— Add a group —"
          @update:modelValue="(v) => setIds('team', v)"
        />
      </template>
    </BaseField>

    <BaseField
      label="Roles"
      hint="Everyone holding the role, including people who hold it through a group."
    >
      <template #default="field">
        <RoleSelectMenu
          v-bind="field"
          multiple
          :modelValue="roleIds"
          :disabled="disabled"
          @update:modelValue="(v) => setIds('role', v)"
        />
      </template>
    </BaseField>

    <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
      <BaseBadge v-if="userIds.length">
        <template #icon><IconUsers :size="12" aria-hidden="true" /></template>
        {{ userIds.length }} {{ userIds.length === 1 ? 'person' : 'people' }}
      </BaseBadge>
      <BaseBadge v-if="teamIds.length">
        <template #icon><IconUsersGroup :size="12" aria-hidden="true" /></template>
        {{ teamIds.length }} {{ teamIds.length === 1 ? 'group' : 'groups' }}
      </BaseBadge>
      <BaseBadge v-if="roleIds.length">
        <template #icon><IconShieldLock :size="12" aria-hidden="true" /></template>
        {{ roleIds.length }} {{ roleIds.length === 1 ? 'role' : 'roles' }}
      </BaseBadge>
      <BaseText v-if="total === 0" variant="caption" color="secondary">
        Nobody yet. A schedule can be saved with no recipients, but it cannot be turned on
        without at least one.
      </BaseText>
    </div>

    <!-- Said plainly, because the absence of an email box is the single most
         surprising thing about this form and the reason is worth one line. -->
    <BaseText variant="caption" color="secondary">
      Reports are sent to people in this workspace, never to typed email addresses — that is
      what lets us re-check each recipient's access at every send instead of trusting a list
      written months ago. Each person receives their own copy, resolved under their own access
      scope, so two recipients may legitimately see different numbers.
    </BaseText>
  </div>
</template>
