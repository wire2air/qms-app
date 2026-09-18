<script setup>
/**
 * Shared shell for dashboard widgets — title, optional count pill, a
 * "View all" link, and a slot for the body. Keeps widgets visually uniform.
 *
 * `tone` tints the header with a light pastel so clients can find a panel at a
 * glance (SCHEME_MAP holds styling only). The `[data-drag-handle]` grip lets
 * the dashboard reorder panels (DashboardHome wires useListReorder to it).
 *
 * The grip is a real `<button>`, and it was a bare `aria-hidden` `<span>` until
 * 2026-09-17. That span was unfocusable AND hidden from assistive tech, so the
 * only way to reorder the dashboard was a mouse drag — and the resulting order
 * is PERSISTED to users.settings.dashboardWidgets, which made a saved
 * personalization unreachable for anyone not using a pointer rather than merely
 * awkward. WCAG 2.1.1. useListReorder supplies the keyboard path (↑/↓/Home/End
 * with the grip focused) and the live-region announcement; all this file owes
 * it is a focusable, labelled control to hang them on.
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
      <!--
        `tw:focus-visible:opacity-100` as well as the hover rule: the grip rests
        at 30% opacity, so a keyboard user tabbing onto it would otherwise be
        aiming at a control they can barely see.
      -->
      <button
        data-drag-handle
        type="button"
        class="tw:cursor-grab tw:opacity-30 tw:group-hover:opacity-70 tw:hover:!opacity-100 tw:focus-visible:opacity-100 tw:transition-opacity tw:-ml-1"
        :class="scheme.title"
        :aria-label="`Reorder ${title}. Use arrow keys to move it, Home or End to send it to either end.`"
        aria-keyshortcuts="ArrowUp ArrowDown Home End"
      >
        <IconGripVertical :size="15" aria-hidden="true" />
      </button>
      <BaseText as="h3" weight="bold" :class="scheme.title">{{ title }}</BaseText>
      <span
        v-if="count !== null"
        class="tw:text-caption tw:font-bold tw:px-2 tw:py-0.5 tw:rounded-full"
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
