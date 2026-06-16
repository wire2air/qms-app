<script setup>
const props = defineProps({
  siteId: {
    type: String,
    default: null,
  },
})

const site = useLiveQueryWithDeps(
  [() => props.siteId],
  async (db, [siteId]) => {
    if (!siteId) return null
    return db.Site.findByPk(siteId)
  },

  { models: ['Site'], initial: null },
)
</script>

<template>
  <SiteBadge v-if="site" :site="site" v-bind="$attrs" />
</template>
