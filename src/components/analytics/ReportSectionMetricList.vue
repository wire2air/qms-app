<script setup>
/**
 * The chosen metrics of ONE report section, as a draggable ordered list.
 *
 * ── WHY THIS IS A SEPARATE LIST AND NOT THE PICKER ──────────────────────────
 * The picker above it is a `multiple` BaseSelect, which is a SET control: it
 * decides membership, has no concept of position, and renders its selection as
 * the summary "3 selected" (`useChips` is off). So before this component there
 * was no place on screen where the chosen metrics were even NAMED, let alone
 * ordered — and their array order is exactly what the exporter prints. This
 * list is therefore additive rather than a second copy of the chips: it is the
 * only readout of what a section contains, and being a real list it is the
 * natural thing to drag.
 *
 * Choosing stays in the select; ordering and removal live here. Building a
 * custom multi-select to fuse the two was the alternative and is rejected:
 * BaseSelect carries search, keyboard nav, `maxValues`, loading and the
 * `required` last-value rule, none of which a bespoke control would inherit.
 *
 * ── WHY A COMPONENT AND NOT A LOOP IN THE DIALOG ────────────────────────────
 * `useListReorder` binds ONE container to ONE array, so N sections need N
 * calls. A composable cannot be called inside `v-for`, and a ref-array plus a
 * hand-rolled loop of `useSortable` instances would have to solve teardown on
 * section removal by hand. One component instance per section gets that from
 * Vue for free: its `onScopeDispose` runs when its section is removed.
 */
import { useListReorder } from '@/composables/useListReorder.js'
import { IconGripVertical, IconX } from '@tabler/icons-vue'

const props = defineProps({
  // The section's own `metricKeys`. Mutated IN PLACE — see the reorder note.
  metricKeys: { type: Array, default: () => [] },
  // metric_catalog rows, so a key can be shown by the name a reader knows.
  metricsByKey: { type: Object, default: () => ({}) },
})

/**
 * What a metric is CALLED.
 *
 * The same resolution the picker's own options use (`m.name || m.metricKey`),
 * so a metric reads identically in the list and in the dropdown.
 *
 * The fallback to the raw key is not defensive padding — the catalog is
 * permission-filtered and rollup-gated (`metric_catalog()` selects
 * `WHERE m.is_active AND EXISTS (… analytics_rollup …)` under RLS), so a key
 * that is present for the report's author can be ABSENT for whoever opens the
 * dialog next. A section can also hold a metric deleted since it was written.
 * Printing `custom.68b13f…` is at least honest about what the section will
 * export; a blank row would read as a rendering fault.
 */
function metricLabel(key) {
  return props.metricsByKey[key]?.name || key
}

const listRef = ref(null)

// ── drag reorder ────────────────────────────────────────────────────────────
// The same shape as the sections list one level up, and the same reasoning: a
// metric key has no stored `order`, so moving the array element IS the change
// and it is saved with the rest of the draft. No `onEnd`, nothing to persist
// per row, and a cancelled dialog discards the reorder with every other edit.
//
// ⚠️ The handle selector is `[data-metric-drag-handle]`, DELIBERATELY not the
// `[data-drag-handle]` the sections list uses, because this list is NESTED
// inside a section. `useListReorder` attaches its keydown listener to the
// container and events bubble, so a shared selector would reach BOTH handlers
// on one ↑ press: this one moves the metric, then the section handler's
// `closest('[data-drag-handle]')` also matches, `contains` resolves to the
// enclosing section card, and the section moves too. Two moves, one keypress.
// Distinct selectors make the outer `closest` miss, which is what keeps the
// two levels independent — for the mouse path as well, since SortableJS will
// not start a section drag from a mousedown on an element that does not match
// the outer handle.
useListReorder(listRef, () => props.metricKeys ?? [], {
  handle: '[data-metric-drag-handle]',
  announce: (key, to, total) => `${metricLabel(key)} moved to position ${to + 1} of ${total}.`,
})

/**
 * Removal, so the list is not a read-only mirror the user must go back to the
 * select to edit — reaching past an ordered list to a dropdown to drop the
 * item it is showing reads as a broken control.
 *
 * Mutates the prop array in place, which is the convention the builder
 * components already follow (`ChecklistBuilderCard` does
 * `props.field.rows.splice(i, 1)` beside its own `useListReorder` calls), and
 * which the reorder path requires anyway: `useListReorder` splices the array
 * the getter returns. Emitting a replacement array instead would reorder a
 * COPY and leave the draft untouched. `vue/no-mutating-props` is off in this
 * repo, so this is a deliberate choice rather than a rule slipping past.
 */
function removeMetric(index) {
  props.metricKeys.splice(index, 1)
}
</script>

<template>
  <div v-if="metricKeys.length" class="tw:flex tw:flex-col tw:gap-1">
    <BaseText variant="caption" color="secondary">
      Printed in this order. Drag a metric, or focus its grip and use the arrow keys.
    </BaseText>

    <!--
      `key` is the metric KEY, not the loop index, matching the sections list
      above and for the same focus-retention reason: an index key keeps each
      DOM node in place and rewrites its contents, so a moved row's grip would
      stay focused on whatever now sits at that position and a run of ↑ presses
      would walk a different metric each time. Keying on identity moves the
      node with its data, so focus follows the metric the user is moving.

      Unlike the sections above, a metric row has no text input, so this is
      about the grip rather than a caret — and unlike ConfigChecklist's rows,
      which are free text and key by index because two rows may genuinely read
      the same, a metric key is safe to key on. That was checked rather than
      assumed, at both ends:

        - The VALUE is unique. `metric_catalog()` projects
          `analytics_metrics.id`, which is that table's PRIMARY KEY, from a
          single table with no join that could fan out (the rollup check is an
          EXISTS semi-join, deliberately not a JOIN). Custom metrics are
          compiled into the SAME table under `ON CONFLICT (id) DO UPDATE`, so
          they upsert rather than accumulate. Two catalog rows cannot share a
          key, and nothing on the client concatenates two lists.
        - The ARRAY cannot repeat one. BaseSelect's `selectOption` TOGGLES by
          value equality, so ticking a chosen metric again removes it instead
          of appending a duplicate, and `selectAll` maps the option list, which
          is one entry per catalog row.

      A duplicate could therefore only arrive from a hand-written definition in
      the database. `normaliseDefinition` does not dedupe, so such a row would
      survive a save — the cost is a Vue duplicate-key warning and one of the
      two rows being the one that drags. That is a visible, non-destructive
      failure on input that is already malformed, and it is the right trade
      against keying by index, which would break focus retention for every
      well-formed report.
    -->
    <div ref="listRef" class="tw:flex tw:flex-col tw:gap-1">
      <div
        v-for="(key, i) in metricKeys"
        :key="key"
        class="tw:flex tw:items-center tw:gap-2 tw:rounded tw:border tw:border-divider tw:px-2 tw:py-1"
      >
        <button
          data-metric-drag-handle
          type="button"
          class="tw:shrink-0 tw:cursor-grab tw:rounded tw:p-1 tw:text-secondary tw:hover:text-on-main"
          :aria-label="`Reorder ${metricLabel(key)}. Use arrow keys to move it, Home or End to send it to either end.`"
          aria-keyshortcuts="ArrowUp ArrowDown Home End"
        >
          <IconGripVertical :size="14" aria-hidden="true" />
        </button>

        <BaseText variant="caption" color="secondary" align="right" class="tw:w-5 tw:shrink-0">
          {{ i + 1 }}
        </BaseText>

        <BaseText truncate class="tw:min-w-0 tw:flex-1">{{ metricLabel(key) }}</BaseText>

        <button
          type="button"
          class="tw:shrink-0 tw:rounded tw:p-1 tw:text-secondary tw:hover:text-bad"
          :aria-label="`Remove ${metricLabel(key)} from this section`"
          @click="removeMetric(i)"
        >
          <IconX :size="14" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>
