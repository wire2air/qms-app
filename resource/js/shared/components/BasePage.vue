<script setup>
/**
 * BasePage — the single container that owns page width, horizontal padding, and
 * vertical rhythm for every authenticated app page. It replaces the per-page
 * `tw:flex tw:flex-col tw:gap-3 tw:h-full tw:p-5` (and its many one-off variants:
 * `gap-5`, `p-8`, `mb-12`, ad-hoc `max-w-*`) so no page hand-picks max-width,
 * padding, or section spacing again.
 *
 * Scrolling: the app shell (App.vue) owns it — its content area is
 * `tw:flex-1 tw:overflow-auto`. By DEFAULT BasePage grows with its content and the
 * shell scrolls (natural document flow). For pages with their OWN internal scroll
 * region (sticky table headers, split panes, kanban) pass `fullHeight`: BasePage
 * becomes a full-height flex column and a child marked
 * `tw:flex-1 tw:min-h-0 tw:overflow-auto` scrolls instead of the shell.
 *
 * PageHeader still teleports the title/actions into the top MainHeader; render it
 * as the first child of BasePage to keep the page object cohesive.
 *
 *   <BasePage width="wide" fullHeight>
 *     <PageHeader :icon="IconUsers" title="Users" />
 *     <BaseFilterBar v-model:search="filters.search">…</BaseFilterBar>
 *     <DataTable … class="tw:flex-1 tw:min-h-0" />
 *   </BasePage>
 *
 * Width tiers (centered with mx-auto):
 *   standard (default) — max-w-7xl  (80rem / 1280px) — most list/index pages
 *   wide               — 96rem      (1536px)         — dashboards, wide tables
 *   narrow             — max-w-3xl  (48rem / 768px)  — detail pages, forms
 *   full               — uncapped                    — escape hatch (rare)
 */
const props = defineProps({
  // Flush: no outer padding/gap — the page manages its own spacing INSIDE its
  // scroll container. Used by BaseDetailLayout so the scroller is full-bleed
  // (wheel over the gutters must scroll; the width cap moves inside).
  flush: { type: Boolean, default: false },
  width: {
    type: String,
    default: 'standard',
    validator: (v) => ['standard', 'wide', 'narrow', 'full'].includes(v),
  },
  // Vertical spacing between top-level sections.
  // comfortable (default, 24px) | compact (16px).
  density: {
    type: String,
    default: 'comfortable',
    validator: (v) => ['comfortable', 'compact'].includes(v),
  },
  // Full-height flex column for pages that manage their own internal scroll.
  fullHeight: { type: Boolean, default: false },
  // Apply the standard responsive horizontal padding. Set false for full-bleed
  // content (rare — e.g. a table that should reach the gutters).
  padded: { type: Boolean, default: true },
})

// Static map so Tailwind emits the classes.
const WIDTH = {
  narrow: 'tw:max-w-3xl',
  standard: 'tw:max-w-7xl',
  wide: 'tw:max-w-[96rem]',
  full: 'tw:max-w-none',
}

const containerClass = computed(() => [
  'tw:mx-auto tw:flex tw:w-full tw:flex-col',
  WIDTH[props.width] || WIDTH.standard,
  props.flush ? '' : props.density === 'compact' ? 'tw:gap-4' : 'tw:gap-6',
  props.padded ? 'tw:px-4 tw:sm:px-6 tw:lg:px-8' : '',
  // box-border (Tailwind default) keeps padding inside h-full so fullHeight
  // pages never overflow the shell's scroll container.
  props.flush ? '' : 'tw:py-6 tw:lg:py-8',
  props.fullHeight ? 'tw:h-full tw:min-h-0' : '',
])
</script>

<template>
  <div :class="containerClass">
    <slot />
  </div>
</template>
