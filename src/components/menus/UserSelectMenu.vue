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
  nullLabel: {
    type: String,
    default: 'All',
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

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu v-model="modelValue" :items="users" :required="required" :multiple="multiple" :nullLabel="nullLabel">
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
  </BaseSelectMenu>
</template>
