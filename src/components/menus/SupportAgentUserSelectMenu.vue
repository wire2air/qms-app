<script setup>
/**
 * Pick a Support Desk agent, by their USER id (support_agents.user_id): only
 * people seated as agents, never every user of the company. `includeUserId`
 * keeps a current value listed even if that person is no longer an agent.
 */
const props = defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  nullLabel: { type: String, default: '— Select agent —' },
  includeUserId: { type: String, default: null },
})
const modelValue = defineModel({ type: [String, Array, null], default: null })

const agents = useLiveQuery((db) => db.SupportAgent.where().exec(), {
  models: ['SupportAgent'],
  initial: [],
})
const users = useLiveQuery((db) => db.User.where().exec(), { models: ['User'], initial: [] })
const options = computed(() => {
  const ids = new Set(agents.value.map((a) => a.userId))
  if (props.includeUserId) ids.add(props.includeUserId)
  return users.value
    .filter((u) => ids.has(u.id))
    .map((u) => ({ id: u.id, name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email }))
    .sort((a, b) => a.name.localeCompare(b.name))
})
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="options"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    :nullLabel="nullLabel"
  >
    <template #selected="{ options: picked, remove }">
      <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-1">
        <UserBadgeById
          v-for="o in picked"
          :key="o.value"
          :userId="o.value"
          :clearable="multiple && (!required || picked.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
