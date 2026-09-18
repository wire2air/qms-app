<script setup>
/**
 * BaseDescriptionList — a semantic <dl> for grouped read-only metadata sections
 * (detail-page side rails, overview cards). Replaces the ~20–30 hand-rolled
 *   <div class="tw:flex tw:flex-col">
 *     <div class="tw:flex tw:justify-between tw:py-2">
 *       <span class="tw:text-xs tw:text-secondary">Owner</span>
 *       <UserBadgeById :userId="…" />
 *     </div>
 *     …
 *   </div>
 * blocks (e.g. ChangeRequestsPageId "Overview" rail) with a real
 * <dl>/<dt>/<dd> structure that screen readers announce as a description list.
 *
 * Pair with <BaseDescriptionItem> children — they inherit `layout` from the list
 * via provide/inject (UI structural coordination, not data — see CLAUDE.md #4),
 * so you set it once on the list:
 *
 *   <BaseDescriptionList divided>
 *     <BaseDescriptionItem label="Owner"><UserBadgeById :userId="cr.ownerId" /></BaseDescriptionItem>
 *     <BaseDescriptionItem label="Site"><SiteBadgeById :siteId="cr.siteId" /></BaseDescriptionItem>
 *   </BaseDescriptionList>
 *
 * For a single standalone label/value pair (not part of a list) use
 * BaseDetailField instead; for an editable field use BaseField.
 */
const props = defineProps({
  // 'inline' — label left, value right (default, the side-rail look);
  // 'stacked' — label above value.
  layout: {
    type: String,
    default: 'inline',
    validator: (v) => ['inline', 'stacked'].includes(v),
  },
  // Quiet divider line between consecutive items (the subsection-rail treatment).
  divided: { type: Boolean, default: false },
})

// UI-only structural coordination for BaseDescriptionItem (inherited layout) —
// not application data. Mirrors BaseTabs' provide('baseTabs', …) convention.
provide('baseDescriptionList', {
  layout: computed(() => props.layout),
})
</script>

<template>
  <dl
    class="tw:flex tw:flex-col"
    :class="divided && 'tw:divide-y tw:divide-divider'"
  >
    <slot />
  </dl>
</template>
