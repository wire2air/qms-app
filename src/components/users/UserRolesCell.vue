<script setup>
// Per-row roles for the Users DataTable. A live query can't live in a table
// slot (slots aren't their own setup scope), so each row renders this cell.
const props = defineProps({
  userId: { type: String, required: true },
})

const roles = useLiveQueryWithDeps(
  [() => props.userId],
  async (db, [userId]) => {
    const assignments = await db.RoleOnUser.where('userId', userId).exec()
    const results = await Promise.all(assignments.map((a) => db.Role.findByPk(a.roleId)))
    return results.filter(Boolean)
  },
  { models: ['RoleOnUser', 'Role'], initial: [] },
)

const label = computed(() =>
  roles.value.length ? roles.value.map((r) => r.name).join(', ') : '—',
)
</script>

<template>
  <span class="tw:line-clamp-1 tw:max-w-xs tw:text-sm tw:text-secondary">{{ label }}</span>
</template>
