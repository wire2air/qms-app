<script setup>
// Picks an EXTERNAL_SUPPLIER portal user at a given supplier. Wraps
// BaseSelectMenu (entity select) per the triad rule; scoped by supplierId.
const props = defineProps({
  supplierId: { type: String, default: null },
  required: { type: Boolean, default: false },
})
const modelValue = defineModel({ type: [String, null], default: null })

const users = useLiveQueryWithDeps(
  [() => props.supplierId],
  async (db, [sid]) => {
    if (!sid) return []
    const rows = await db.User.where('supplierId', sid).exec()
    return rows.filter((u) => u.kind === 'EXTERNAL_SUPPLIER')
  },
  { models: ['User'], initial: [] },
)

const items = computed(() =>
  users.value.map((u) => ({
    id: u.id,
    name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id,
  })),
)

function nameFor(id) {
  return items.value.find((u) => u.id === id)?.name || ''
}
</script>

<template>
  <BaseSelectMenu v-model="modelValue" :items="items" :required="required" :disabled="!supplierId">
    <template #button="{ selected }">
      <span v-if="nameFor(selected)" class="tw:truncate tw:text-sm tw:text-on-main">
        {{ nameFor(selected) }}
      </span>
      <span v-else class="tw:text-sm tw:text-placeholder">
        {{ supplierId ? 'Select supplier user' : 'Select a supplier first' }}
      </span>
    </template>
  </BaseSelectMenu>
</template>
