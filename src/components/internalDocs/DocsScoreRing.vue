<script setup>
/**
 * Production-readiness score (0–100) as a small ring, colored by band.
 * Score is parsed from the pack's executive summary — display only.
 */
const props = defineProps({
  score: { type: Number, default: null },
  size: { type: Number, default: 40 },
})

const colorClass = computed(() => {
  if (props.score == null) return 'tw:text-secondary'
  if (props.score >= 60) return 'tw:text-warn'
  return 'tw:text-bad'
})
</script>

<template>
  <div
    v-if="score != null"
    class="tw:relative tw:shrink-0"
    :class="colorClass"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :aria-label="`Production score ${score} of 100`"
    role="img"
  >
    <svg viewBox="0 0 36 36" class="tw:size-full tw:-rotate-90">
      <circle
        cx="18"
        cy="18"
        r="15.9"
        fill="none"
        stroke="var(--color-divider, #e2e8f0)"
        stroke-width="3.4"
      />
      <circle
        cx="18"
        cy="18"
        r="15.9"
        fill="none"
        stroke="currentColor"
        stroke-width="3.4"
        stroke-linecap="round"
        pathLength="100"
        :stroke-dasharray="`${score} 100`"
      />
    </svg>
    <span
      class="tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:text-caption tw:font-semibold tw:text-on-main"
    >
      {{ score }}
    </span>
  </div>
</template>
