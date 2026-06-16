<script setup>
import { IconUsers, IconEdit } from '@tabler/icons-vue'

const props = defineProps({
  trainingId: { type: String, required: true },
  canUpdate: { type: Boolean, default: false },
})

const dialogOpen = ref(false)

const trainingRoles = useLiveQueryWithDeps(
  [() => props.trainingId],
  async (db, [trainingId]) => {
    if (!trainingId) return []
    return db.TrainingRole.where('trainingId', trainingId).exec()
  },

  { models: ['TrainingRole'], initial: [] },
)

const trainingUsers = useLiveQueryWithDeps(
  [() => props.trainingId],
  async (db, [trainingId]) => {
    if (!trainingId) return []
    return db.TrainingUser.where('trainingId', trainingId).exec()
  },

  { models: ['TrainingUser'], initial: [] },
)

const roleIds = computed(() => trainingRoles.value.map((r) => r.roleId))
const userIds = computed(() => trainingUsers.value.map((u) => u.userId))
</script>

<template>
  <div class="tw:space-y-4">
    <div class="tw:flex tw:items-center tw:justify-between">
      <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary">
        <IconUsers :size="22" />
        <h2 class="tw:text-lg tw:font-bold tw:text-on-main">Assignees</h2>
      </div>
      <BaseButton v-if="canUpdate" variant="outline" size="sm" @click="dialogOpen = true">
        <template #icon><IconEdit :size="14" /></template>
        Manage Assignees
      </BaseButton>
    </div>

    <p class="tw:text-xs tw:text-secondary">
      All users with the assigned roles, plus directly assigned users, will receive this training
      when it is launched.
    </p>

    <div class="tw:border tw:border-divider tw:rounded-xl tw:p-6 tw:space-y-5">
      <div>
        <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-2">
          Assigned Roles
        </label>
        <div v-if="roleIds.length > 0" class="tw:flex tw:flex-wrap tw:gap-2">
          <RoleBadgeById v-for="roleId in roleIds" :key="roleId" :roleId="roleId" />
        </div>
        <span v-else class="tw:text-sm tw:text-secondary">No roles assigned</span>
      </div>

      <div>
        <label class="tw:block tw:text-xs tw:font-bold tw:text-secondary tw:uppercase tw:mb-2">
          Assigned Users
        </label>
        <div v-if="userIds.length > 0" class="tw:flex tw:flex-wrap tw:gap-2">
          <UserBadgeById v-for="userId in userIds" :key="userId" :userId="userId" />
        </div>
        <span v-else class="tw:text-sm tw:text-secondary">No users assigned</span>
      </div>
    </div>

    <TrainingAssigneesDialog v-model="dialogOpen" :trainingId="trainingId" :canUpdate="canUpdate" />
  </div>
</template>
