<script setup>
const props = defineProps({ countryId: { type: String, default: null } })
const country = useLiveQueryWithDeps(
  [() => props.countryId],
  async (db, [id]) => {
    if (!id) return null
    return db.Country.findByPk(id)
  },
  { initial: () => (props.countryId ? { id: props.countryId } : null) },
)
</script>
<template>
  <CountryBadge v-if="country" :country="country" v-bind="$attrs" />
</template>
