<script setup>
defineProps({
  required: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

const users = useLiveQuery(
  async (db) => {
    const users = await db.User.where().exec()
    return users.map((user) => ({ id: user.id, name: `${user.firstName} ${user.lastName}` }))
  },
  { initial: [] },
)

const roleById = useLiveQuery(
  async (db) => {
    const roles = await db.Role.where().exec()
    return Object.fromEntries(roles.map((r) => [r.id, r]))
  },
  { initial: {} },
)

const roleIdsOnUsers = useLiveQuery(
  async (db) => {
    const rou = await db.RoleOnUser.where().exec()
    const map = {}
    rou.forEach((r) => {
      if (!map[r.userId]) map[r.userId] = []
      map[r.userId].push(r.roleId)
    })
    return map
  },
  { initial: {} },
)

const rolesByUserId = computed(() => {
  const map = {}
  for (const [userId, roleIds] of Object.entries(roleIdsOnUsers.value)) {
    map[userId] = roleIds
      .map((id) => roleById.value[id])
      .filter(Boolean)
      .map((r) => r.name)
      .sort((a, b) => a.localeCompare(b))
      .join(', ')
  }
  return map
})

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu v-model="modelValue" :items="users" :required="required" :multiple="multiple">
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <!-- MULTIPLE MODE -->
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <UserBadgeById
              v-for="userId in getArray()"
              :key="userId"
              :userId="userId"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(userId)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"> Select Users </span>
        </template>

        <!-- SINGLE MODE -->
        <template v-else>
          <UserBadgeById
            v-if="modelValue"
            :userId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"> Select User </span>
        </template>
      </slot>
    </template>

    <template #item="{ item }">
      <div class="tw:flex tw:flex-col">
        <span>{{ item.name }}</span>
        <span v-if="rolesByUserId[item.id]" class="tw:text-xs tw:text-placeholder">
          {{ rolesByUserId[item.id] }}
        </span>
      </div>
    </template>
  </BaseSelectMenu>
</template>
