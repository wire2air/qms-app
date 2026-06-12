<script setup>
// Enum badge — ticket sentiment (manual or routing-rule set).
const props = defineProps({
  sentiment: { type: String, default: null },
})

const SENTIMENT_MAP = {
  POSITIVE: { name: 'Positive', class: 'tw:bg-green-100 tw:text-green-700' },
  NEUTRAL: { name: 'Neutral', class: 'tw:bg-gray-100 tw:text-gray-600' },
  NEGATIVE: { name: 'Negative', class: 'tw:bg-orange-100 tw:text-orange-700' },
  URGENT: { name: 'Urgent', class: 'tw:bg-red-100 tw:text-red-700' },
}

const display = computed(() => SENTIMENT_MAP[props.sentiment] ?? null)
</script>

<template>
  <BaseBadge v-if="display" v-bind="$attrs" :class="display.class">{{ display.name }}</BaseBadge>
</template>
