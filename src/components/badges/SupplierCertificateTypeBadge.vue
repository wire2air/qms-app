<script setup>
/**
 * Object → display. Same data-driven colour pattern as
 * RootCauseCategoryBadge — colour off the row (tenant-configured),
 * tinted background via 1A alpha suffix, neutral grey fallback when
 * no colour is set.
 */
const props = defineProps({
  certificateType: { type: Object, required: true },
})

const badgeStyle = computed(() => {
  if (!props.certificateType?.color) return undefined
  return {
    backgroundColor: `${props.certificateType.color}1A`,
    color: props.certificateType.color,
  }
})
</script>

<template>
  <BaseBadge
    v-bind="$attrs"
    :style="badgeStyle"
    :class="!certificateType?.color ? 'tw:bg-gray-100 tw:text-gray-600' : ''"
  >
    {{ certificateType.name || certificateType.code || '—' }}
  </BaseBadge>
</template>
