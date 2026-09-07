<script setup>
/**
 * Whose tasks the inbox is showing: mine, everyone I supervise, or one named
 * person. ONE control rather than a scope tab plus a separate assignee filter —
 * both were answering the same question, so a manager had to set "team" and
 * then set a person, twice, and the two could disagree.
 *
 * The value is a scope token: 'mine', 'all', or a user id. Not an entity
 * select (two of the three options are not records), so it composes BaseSelect
 * directly rather than the badge triad — but the employee rows still resolve
 * through the syncEngine like any other user picker.
 *
 * Rendered only where a roster exists; a viewer with no subordinates has one
 * possible answer and gets no control at all (taskInstancesHome owns that gate).
 */
const props = defineProps({
  // The people this viewer supervises. Also the whitelist: a scope token
  // naming anyone outside it is not selectable here.
  userIds: { type: Array, default: () => [] },
})

const modelValue = defineModel({ type: String, default: 'mine' })

// `force: true` — a deactivated teammate with open tasks is exactly who a
// manager comes here to find, so they stay selectable by name.
const members = useLiveQueryWithDeps(
  [() => props.userIds.join(',')],
  async (db, [key]) => {
    const ids = key ? key.split(',') : []
    if (!ids.length) return []
    const users = await Promise.all(ids.map((id) => db.User.findByPk(id, { force: true })))
    return users
      .filter(Boolean)
      .map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim() || u.email,
        description: u.jobTitle || '',
        group: 'Team members',
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  },

  { models: ['User'], initial: [] },
)

const options = computed(() => [
  { id: 'mine', name: 'My tasks', description: 'Assigned to me', group: 'Show' },
  {
    id: 'all',
    name: 'All tasks',
    description: 'Mine and everyone I supervise',
    group: 'Show',
  },
  ...members.value,
])
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="options"
    optionLabel="name"
    optionValue="id"
    optionGroup="group"
    optionDescription="description"
    required
    :autoFill="false"
    searchable
  />
</template>
