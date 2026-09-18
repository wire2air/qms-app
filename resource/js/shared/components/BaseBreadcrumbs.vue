<script setup>
/**
 * BaseBreadcrumbs — the breadcrumb trail. Implements the WAI-ARIA breadcrumb
 * pattern: a <nav aria-label> wrapping an <ol>, with the current (last) crumb
 * marked aria-current="page" and the chevron separators hidden from assistive
 * tech. Non-terminal items with a `to` render as RouterLinks.
 *
 *   <BaseBreadcrumbs :items="[{ label: 'Documents', to: '/documents' }, { label: 'DOC-12' }]" />
 */
import { IconChevronRight } from '@tabler/icons-vue'

defineProps({
  // [{ label, to? }] — the last item is the current page (no link).
  items: {
    type: Array,
    default: () => [],
  },
  ariaLabel: { type: String, default: 'Breadcrumb' },
})
</script>

<template>
  <nav :aria-label="ariaLabel">
    <ol class="tw:flex tw:flex-nowrap tw:items-center tw:gap-1 tw:text-nowrap tw:list-none">
      <li
        v-for="(item, index) in items"
        :key="`${item.label}-${index}`"
        class="tw:flex tw:items-center tw:gap-1"
      >
        <component
          :is="item.to && index < items.length - 1 ? 'RouterLink' : 'span'"
          :to="item.to"
          :aria-current="index === items.length - 1 ? 'page' : undefined"
          :class="
            index < items.length - 1 ? 'tw:text-on-main tw:hover:text-primary!' : 'tw:font-semibold'
          "
        >
          {{ item.label }}
        </component>
        <IconChevronRight
          v-if="index < items.length - 1"
          :size="16"
          class="tw:text-gray-400"
          aria-hidden="true"
        />
      </li>
    </ol>
  </nav>
</template>
