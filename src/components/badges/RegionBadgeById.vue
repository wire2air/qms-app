<script setup>
const props = defineProps({ regionId: { type: String, default: null } })
const region = useLiveQueryWithDeps(
  [() => props.regionId],
  async (db, [id]) => {
    if (!id) return null
    return db.Region.findByPk(id)
  },
  { initial: () => (props.regionId ? { id: props.regionId } : null) },
)
</script>
<template>
  <RegionBadge v-if="region" :region="region" v-bind="$attrs" />
</template>
