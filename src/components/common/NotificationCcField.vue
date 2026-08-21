<script setup>
/**
 * Per-record "Notify (cc)" picker — groups, people, and outside email addresses
 * who get a heads-up when the record opens or closes.
 * cc/FYI only; the owner/assignee already get the built-in task notifications.
 *
 * Three v-models so it binds to a form draft or directly to a synced entity:
 *   <NotificationCcField v-model:groupIds="nc.notifyGroupIds"
 *                        v-model:userIds="nc.notifyUserIds"
 *                        v-model:emails="nc.notifyEmails" :editable="isEditable" />
 */
import { IconMail } from '@tabler/icons-vue'

defineProps({
  editable: { type: Boolean, default: true },
  /**
   * What this field actually does, in the reader's terms.
   *
   * The wording has been wrong twice in different ways. It once said "on create
   * and status changes", which was true of the old engine and is no longer:
   * notifications now fire when a record OPENS (leaves draft) and when it
   * CLOSES, and on nothing in between. Describing it as "every status change"
   * promised mail that will not arrive — the worst kind of wrong for a
   * notification setting, because nobody notices the absence.
   *
   * It also implied this list was the whole picture. It is not: rules under
   * Templates → Notifications & Automation add recipients on top.
   */
  hint: {
    type: String,
    default:
      'Cc’d in addition to the people already involved — when the record is opened and when it is closed, not on every step in between. They are not assigned a task. Notification rules set up by an administrator may add more recipients.',
  },
})

const groupIds = defineModel('groupIds', { type: Array, default: () => [] })
const userIds = defineModel('userIds', { type: Array, default: () => [] })
const emails = defineModel('emails', { type: Array, default: () => [] })

/**
 * Deliberately permissive — something@something.something with no spaces.
 *
 * The job here is catching the typo and the pasted name, not adjudicating
 * RFC 5322. A stricter pattern rejects addresses that genuinely work (plus
 * tags, long TLDs, unicode domains), and a rejected valid address is a worse
 * outcome than an accepted invalid one: the person is standing right there and
 * cannot proceed, whereas a bad address bounces visibly at the mail server.
 */
function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? true : `“${value}” is not an email address`
}
</script>

<template>
  <div>
    <div v-if="editable" class="tw:flex tw:flex-col tw:gap-3">
      <BaseField label="Notify groups">
        <GroupSelectMenu v-model="groupIds" multiple class="tw:w-full" />
      </BaseField>
      <BaseField label="Notify people">
        <UserSelectMenu v-model="userIds" multiple class="tw:w-full" />
      </BaseField>
      <BaseField
        label="Notify email addresses"
        hint="For people outside the system — a customer, a supplier’s quality lead, an auditor. They receive the email only; they get no access to the record."
      >
        <template #default="field">
          <BaseTagsInput
            v-bind="field"
            v-model="emails"
            :validate="validateEmail"
            placeholder="name@company.com — press Enter"
            class="tw:w-full"
          />
        </template>
      </BaseField>
    </div>

    <!-- Read-only summary -->
    <div v-else class="tw:flex tw:flex-wrap tw:gap-1.5">
      <GroupBadgeById v-for="id in groupIds" :key="`g-${id}`" :teamId="id" />
      <UserBadgeById v-for="id in userIds" :key="`u-${id}`" :userId="id" />
      <BaseBadge
        v-for="email in emails"
        :key="`e-${email}`"
        class="tw:bg-sidebar tw:text-on-main"
        size="sm"
      >
        <IconMail class="tw:mr-1 tw:inline tw:size-3.5" />{{ email }}
      </BaseBadge>
      <BaseText v-if="!groupIds.length && !userIds.length && !emails.length" color="secondary">
        —
      </BaseText>
    </div>

    <p v-if="editable && hint" class="tw:text-xs tw:text-secondary tw:mt-1">{{ hint }}</p>
  </div>
</template>
