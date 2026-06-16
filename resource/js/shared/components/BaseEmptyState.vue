<script setup>
defineProps({
  icon: {
    type: [Object, Function],
    default: null,
  },
  title: {
    type: String,
    default: 'No results found',
  },
  description: {
    type: String,
    default: null,
  },
  dense: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <div
    class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:text-center"
    :class="dense ? 'tw:py-4' : 'tw:py-12'"
  >
    <component
      :is="icon"
      v-if="icon"
      :size="dense ? 24 : 40"
      class="tw:text-secondary tw:opacity-50"
      :class="dense ? 'tw:mb-1' : 'tw:mb-3'"
    />
    <p class="tw:font-semibold tw:text-on-main" :class="dense ? 'tw:text-xs' : 'tw:text-sm'">
      {{ title }}
    </p>
    <p v-if="description" class="tw:text-xs tw:text-secondary tw:mt-1">{{ description }}</p>
    <div v-if="$slots.action" :class="dense ? 'tw:mt-2' : 'tw:mt-4'">
      <slot name="action" />
    </div>
  </div>
</template>
