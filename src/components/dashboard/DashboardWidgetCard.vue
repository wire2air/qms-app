<script setup>
/**
 * Shared shell for dashboard widgets — title, optional count pill, a
 * "View all" link, and a slot for the body. Keeps widgets visually uniform.
 */
import { getCompanyPath } from '@/utils/routeHelpers.js'

defineProps({
  title: { type: String, required: true },
  count: { type: Number, default: null },
  linkTo: { type: String, default: null },
  linkLabel: { type: String, default: 'View all' },
})
</script>

<template>
  <div class="tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:flex tw:flex-col">
    <div class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-3 tw:border-b tw:border-divider">
      <BaseText as="h3" weight="bold">{{ title }}</BaseText>
      <span
        v-if="count !== null"
        class="tw:text-[11px] tw:font-bold tw:px-2 tw:py-0.5 tw:rounded-full tw:bg-primary/10 tw:text-primary"
      >
        {{ count }}
      </span>
      <div class="tw:flex-1" />
      <RouterLink
        v-if="linkTo"
        :to="getCompanyPath(linkTo)"
        class="tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
      >
        {{ linkLabel }}
      </RouterLink>
    </div>
    <div class="tw:flex-1 tw:min-h-0">
      <slot />
    </div>
  </div>
</template>
