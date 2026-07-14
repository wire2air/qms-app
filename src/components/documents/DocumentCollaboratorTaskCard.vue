<script setup>
/**
 * Shown to a collaborator who has an open REVIEW task on this document (created
 * when they were added as a collaborator). Lets them mark their contribution
 * complete, which clears the task from their inbox and from the owner's
 * submit-for-review reminder. Self-hides when there's no open task for the
 * current user.
 */
import { currentSession } from '@/utils/currentSession.js'
import { IconUsersGroup, IconCircleCheck } from '@tabler/icons-vue'
import { DateTime } from 'luxon'

const props = defineProps({
  documentId: { type: String, required: true },
})

const currentUserId = computed(() => currentSession.value?.userId)

const myTask = useLiveQueryWithDeps(
  [() => props.documentId, () => currentUserId.value],
  async (db, [id, userId]) => {
    if (!id || !userId) return null
    const tasks = await db.TaskInstance.where('[entityType+entityId]', ['Document', id]).exec()
    return (
      tasks.find(
        (t) =>
          t.sourceType === 'DocumentCollaborator' &&
          t.assignedTo === userId &&
          ['ASSIGNED', 'IN_PROGRESS'].includes(t.statusId),
      ) || null
    )
  },
  { models: ['TaskInstance'], initial: null },
)

const saving = ref(false)
const toast = useToast()

async function markComplete() {
  if (!myTask.value || saving.value) return
  saving.value = true
  try {
    myTask.value.statusId = 'APPROVED'
    myTask.value.completedAt = DateTime.now()
    await myTask.value.save()
    toast.success('Collaboration marked complete')
  } catch (e) {
    toast.error(e?.message || 'Failed to update task')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseRailCard v-if="myTask" title="Your collaboration" :icon="IconUsersGroup">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <p class="tw:text-sm tw:text-secondary">{{ myTask.comment }}</p>
      <BaseButton variant="primary" size="sm" :isLoading="saving" @click="markComplete">
        <template #icon><IconCircleCheck :size="16" /></template>
        Mark complete
      </BaseButton>
    </div>
  </BaseRailCard>
</template>
