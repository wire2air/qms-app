<script setup>
/**
 * Shared shell for dashboard widgets — title, optional count pill, a
 * "View all" link, and a slot for the body. Keeps widgets visually uniform.
 *
 * `tone` tints the header with a light pastel so clients can find a panel at a
 * glance (SCHEME_MAP holds styling only). The `.drag-handle` grip lets the
 * dashboard reorder panels (DashboardHome wires SortableJS to it).
 */
import { IconGripVertical } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  title: { type: String, required: true },
  count: { type: Number, default: null },
  linkTo: { type: String, default: null },
  linkLabel: { type: String, default: 'View all' },
  tone: { type: String, default: 'default' },
})

// Light-pastel header schemes (styling only). header = strip bg; title = label
// color; count = the count pill. Mirrors the badge-triad SCHEME_MAP convention.
const SCHEME_MAP = {
  default: { header: 'tw:bg-sidebar', title: 'tw:text-on-main', count: 'tw:bg-primary/10 tw:text-primary' },
  blue: { header: 'tw:bg-blue-100', title: 'tw:text-blue-800', count: 'tw:bg-blue-200 tw:text-blue-800' },
  rose: { header: 'tw:bg-rose-100', title: 'tw:text-rose-800', count: 'tw:bg-rose-200 tw:text-rose-800' },
  amber: { header: 'tw:bg-amber-100', title: 'tw:text-amber-800', count: 'tw:bg-amber-200 tw:text-amber-800' },
  violet: { header: 'tw:bg-violet-100', title: 'tw:text-violet-800', count: 'tw:bg-violet-200 tw:text-violet-800' },
  teal: { header: 'tw:bg-teal-100', title: 'tw:text-teal-800', count: 'tw:bg-teal-200 tw:text-teal-800' },
  indigo: { header: 'tw:bg-indigo-100', title: 'tw:text-indigo-800', count: 'tw:bg-indigo-200 tw:text-indigo-800' },
  emerald: { header: 'tw:bg-emerald-100', title: 'tw:text-emerald-800', count: 'tw:bg-emerald-200 tw:text-emerald-800' },
}
const scheme = computed(() => SCHEME_MAP[props.tone] || SCHEME_MAP.default)
</script>

<template>
  <div class="tw:group tw:rounded-xl tw:border tw:border-divider tw:bg-sidebar tw:flex tw:flex-col tw:overflow-hidden">
    <div class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-3 tw:border-b tw:border-divider" :class="scheme.header">
      <span
        class="drag-handle tw:cursor-grab tw:opacity-30 tw:group-hover:opacity-70 tw:hover:!opacity-100 tw:transition-opacity tw:-ml-1"
        :class="scheme.title"
        title="Drag to rearrange"
        aria-hidden="true"
      >
        <IconGripVertical :size="15" />
      </span>
      <BaseText as="h3" weight="bold" :class="scheme.title">{{ title }}</BaseText>
      <span
        v-if="count !== null"
        class="tw:text-[11px] tw:font-bold tw:px-2 tw:py-0.5 tw:rounded-full"
        :class="scheme.count"
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
