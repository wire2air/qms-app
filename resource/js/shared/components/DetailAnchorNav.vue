<script setup>
defineProps({
  sections: { type: Array, default: () => [] },
  activeId: { type: String, default: '' },
})
</script>

<template>
  <nav
    aria-label="Sections"
    class="tw:flex tw:gap-1 tw:overflow-x-auto tw:border-b tw:border-divider tw:py-2"
  >
    <a
      v-for="s in sections"
      :key="s.id"
      :href="`#section-${s.id}`"
      :aria-current="activeId === s.id ? 'true' : undefined"
      class="tw:flex tw:items-center tw:gap-1.5 tw:whitespace-nowrap tw:rounded-md tw:px-3 tw:py-1.5 tw:text-body tw:font-medium tw:transition-colors tw:motion-reduce:transition-none"
      :class="
        activeId === s.id
          ? 'tw:bg-primary/10 tw:text-primary'
          : 'tw:text-secondary tw:hover:text-on-main'
      "
    >
      <component :is="s.icon" v-if="s.icon" :size="16" aria-hidden="true" />
      {{ s.label }}
    </a>
  </nav>
</template>
