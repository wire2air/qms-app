<script setup>
/**
 * Per-record "Notify (cc)" picker — groups + people who get an in-app + email
 * heads-up when the record is created or changes status (notification engine).
 * cc/FYI only; the owner/assignee already get the built-in task notifications.
 *
 * Two v-models so it binds to a form draft or directly to a synced entity:
 *   <NotificationCcField v-model:groupIds="nc.notifyGroupIds"
 *                        v-model:userIds="nc.notifyUserIds" :editable="isEditable" />
 */
defineProps({
  editable: { type: Boolean, default: true },
  /**
   * What this field actually does, in the reader's terms.
   *
   * The old wording — "Notified in-app + email on create and status changes.
   * No task is created." — left two questions unanswered that people kept
   * asking (2026-08-20): WHICH status changes, and whether these are the only
   * people who get told. They are not: notification rules configured under
   * Templates → Notifications & Automation add recipients on top of this list,
   * so someone reading only this field would think it was the whole picture.
   */
  hint: {
    type: String,
    default:
      'Cc’d in addition to the people already involved — in app and by email when the record is created and on every status change. They are not assigned a task. Notification rules set up by an administrator may add more recipients.',
  },
})

const groupIds = defineModel('groupIds', { type: Array, default: () => [] })
const userIds = defineModel('userIds', { type: Array, default: () => [] })
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
    </div>

    <!-- Read-only summary -->
    <div v-else class="tw:flex tw:flex-wrap tw:gap-1.5">
      <GroupBadgeById v-for="id in groupIds" :key="`g-${id}`" :teamId="id" />
      <UserBadgeById v-for="id in userIds" :key="`u-${id}`" :userId="id" />
      <BaseText v-if="!groupIds.length && !userIds.length" color="secondary">—</BaseText>
    </div>

    <p v-if="editable && hint" class="tw:text-xs tw:text-secondary tw:mt-1">{{ hint }}</p>
  </div>
</template>
