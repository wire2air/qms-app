<script setup>
/**
 * Renders the cross-module record navigation trail (see useRecordTrail). Each
 * earlier record is a link back to it (navigating there truncates the chain via
 * the target page's visit() call); the current record is plain text. Hidden
 * when there's no chain (≤ 1 entry) so single-record views stay clean.
 */
import { IconChevronRight } from '@tabler/icons-vue'
import { useRecordTrail } from '@/composables/useRecordTrail.js'

const { trail } = useRecordTrail()

// Only show once there's an actual chain (you arrived here from another record).
const show = computed(() => trail.value.length > 1)
</script>

<template>
  <nav
    v-if="show"
    aria-label="Record trail"
    class="tw:flex tw:items-center tw:flex-wrap tw:gap-0.5 tw:text-sm"
  >
    <template v-for="(entry, i) in trail" :key="entry.path">
      <IconChevronRight v-if="i > 0" :size="14" class="tw:text-secondary tw:shrink-0" />
      <RouterLink
        v-if="i < trail.length - 1"
        :to="entry.path"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:px-1.5 tw:py-0.5 tw:rounded tw:text-secondary tw:hover:text-primary tw:hover:bg-main-hover tw:no-underline tw:transition-colors"
      >
        <span v-if="entry.type" class="tw:text-caption tw:uppercase tw:tracking-wider tw:opacity-70">{{ entry.type }}</span>
        <span class="tw:font-medium">{{ entry.label || entry.id }}</span>
      </RouterLink>
      <span
        v-else
        class="tw:inline-flex tw:items-center tw:gap-1 tw:px-1.5 tw:py-0.5 tw:text-on-main tw:font-semibold"
      >
        <span v-if="entry.type" class="tw:text-caption tw:uppercase tw:tracking-wider tw:opacity-70">{{ entry.type }}</span>
        {{ entry.label || entry.id }}
      </span>
    </template>
  </nav>
</template>
