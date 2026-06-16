<script setup>
const props = defineProps({
  issueTypeId: { type: String, default: null },
})

const issueType = useLiveQueryWithDeps(
  [() => props.issueTypeId],
  async (db, [id]) => {
    if (!id) return null
    return db.NcIssueType.findByPk(id)
  },
  { models: ['NcIssueType'] },
)
</script>

<template>
  <NcIssueTypeBadge v-if="issueType" :issueType="issueType" v-bind="$attrs" />
</template>
