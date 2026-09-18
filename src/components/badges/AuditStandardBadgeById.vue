<script setup>
/**
 * Id → badge resolver for AuditStandard. Lets the badge render even
 * before IDB resolves the row by passing an `initial` stub that
 * carries just the id — XBadge's `name || code || id` fallback covers
 * the gap. Mirrors the patterns documented in the frontend CLAUDE.md.
 */
const props = defineProps({
  standardId: { type: String, default: null },
})

const standard = useLiveQueryWithDeps(
  [() => props.standardId],
  async (db, [id]) => {
    if (!id) return null
    return db.AuditStandard.findByPk(id)
  },

  {
    models: ['AuditStandard'],
    initial: () => (props.standardId ? { id: props.standardId } : null),
  },
)
</script>

<template>
  <AuditStandardBadge v-if="standard" :standard="standard" v-bind="$attrs" />
</template>
