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
  hint: {
    type: String,
    default: 'Notified in-app + email on create and status changes. No task is created.',
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
