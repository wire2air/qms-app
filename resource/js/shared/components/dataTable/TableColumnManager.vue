<script setup>
/**
 * Column manager — the universal control for every DataTable: show/hide, reorder
 * (↑/↓) and pin columns. Engine-backed (reads/writes the TanStack column model),
 * so all of it is real, restorable engine state (persisted via persistKey), not a
 * per-table localStorage hack. Replaces bespoke per-table column pickers.
 */
import {
  IconColumns,
  IconCheck,
  IconRefresh,
  IconPin,
  IconPinFilled,
  IconChevronUp,
  IconChevronDown,
} from '@tabler/icons-vue'

const props = defineProps({
  // The TanStack table instance from DataTable (passed, never imported here).
  table: { type: Object, required: true },
})

// All labelled data columns, in their current visual order (the synthetic actions
// column is excluded — it stays pinned at the end).
const manageable = computed(() =>
  props.table.getAllLeafColumns().filter((c) => c.columnDef.meta?.col?.label && c.id !== '__actions'),
)
const visibleCount = computed(() => manageable.value.filter((c) => c.getIsVisible()).length)

function toggle(column) {
  if (!column.getCanHide()) return
  // Never let the user hide the last visible column.
  if (column.getIsVisible() && visibleCount.value <= 1) return
  column.toggleVisibility(!column.getIsVisible())
}
function togglePin(column) {
  column.pin(column.getIsPinned() === 'left' ? false : 'left')
}

// Reorder against the VISIBLE leaf columns (what the user actually sees) — not
// getAllLeafColumns, which includes hidden columns and ignores pinning, so a move
// there could swap with an invisible neighbour and appear to do nothing.
function visibleIds() {
  return props.table
    .getVisibleLeafColumns()
    .map((c) => c.id)
    .filter((id) => id !== '__actions')
}
function move(column, delta) {
  if (!column.getIsVisible()) return
  const vis = visibleIds()
  const vi = vis.indexOf(column.id)
  const targetId = vis[vi + delta]
  if (vi < 0 || !targetId) return
  // Swap the two columns' positions in the full column order.
  const ids = props.table.getAllLeafColumns().map((c) => c.id)
  const i = ids.indexOf(column.id)
  const j = ids.indexOf(targetId)
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  props.table.setColumnOrder(ids)
}
function canMoveUp(column) {
  return column.getIsVisible() && visibleIds().indexOf(column.id) > 0
}
function canMoveDown(column) {
  if (!column.getIsVisible()) return false
  const vis = visibleIds()
  const i = vis.indexOf(column.id)
  return i >= 0 && i < vis.length - 1
}

function reset() {
  props.table.resetColumnVisibility()
  props.table.resetColumnOrder()
  props.table.resetColumnPinning()
}
</script>

<template>
  <BasePopover placement="bottom-end">
    <template #button>
      <button
        type="button"
        title="Columns"
        class="tw:flex tw:items-center tw:gap-1.5 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-xs tw:font-medium tw:text-secondary tw:transition-colors tw:hover:bg-main-hover tw:hover:text-on-main"
      >
        <IconColumns :size="16" />
        <span class="tw:hidden sm:tw:inline">Columns</span>
      </button>
    </template>
    <template #content>
      <div class="tw:w-64 tw:p-1">
        <div
          class="tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-1.5 tw:text-caption tw:font-semibold tw:tracking-wider tw:text-secondary tw:uppercase"
        >
          <span>Columns</span>
          <button
            type="button"
            class="tw:flex tw:items-center tw:gap-1 tw:rounded tw:px-1 tw:py-0.5 tw:text-xs tw:font-medium tw:text-primary tw:transition-colors tw:hover:bg-main-hover"
            @click="reset"
          >
            <IconRefresh :size="12" /> Reset
          </button>
        </div>

        <div
          v-for="column in manageable"
          :key="column.id"
          class="tw:flex tw:items-center tw:rounded-md tw:transition-colors tw:hover:bg-main-hover"
        >
          <button
            type="button"
            role="menuitemcheckbox"
            :aria-checked="column.getIsVisible()"
            :disabled="!column.getCanHide()"
            class="tw:flex tw:flex-1 tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:px-3 tw:py-2 tw:text-sm tw:text-on-sidebar"
            :class="
              (column.getIsVisible() && visibleCount <= 1) || !column.getCanHide()
                ? 'tw:cursor-not-allowed tw:opacity-50'
                : ''
            "
            @click="toggle(column)"
          >
            <span class="tw:truncate">{{ column.columnDef.meta.col.label }}</span>
            <IconCheck
              v-if="column.getIsVisible()"
              :size="15"
              class="tw:shrink-0 tw:text-primary"
            />
          </button>

          <div class="tw:flex tw:items-center">
            <button
              type="button"
              aria-label="Move column up"
              :disabled="!canMoveUp(column)"
              class="tw:flex tw:size-6 tw:items-center tw:justify-center tw:rounded tw:text-placeholder tw:transition-colors tw:hover:bg-sidebar tw:hover:text-on-sidebar disabled:tw:opacity-25 disabled:tw:hover:bg-transparent"
              @click="move(column, -1)"
            >
              <IconChevronUp :size="14" />
            </button>
            <button
              type="button"
              aria-label="Move column down"
              :disabled="!canMoveDown(column)"
              class="tw:flex tw:size-6 tw:items-center tw:justify-center tw:rounded tw:text-placeholder tw:transition-colors tw:hover:bg-sidebar tw:hover:text-on-sidebar disabled:tw:opacity-25 disabled:tw:hover:bg-transparent"
              @click="move(column, 1)"
            >
              <IconChevronDown :size="14" />
            </button>
            <button
              type="button"
              :aria-pressed="column.getIsPinned() === 'left'"
              :title="column.getIsPinned() === 'left' ? 'Unpin column' : 'Pin column left'"
              class="tw:mr-1 tw:flex tw:size-6 tw:shrink-0 tw:items-center tw:justify-center tw:rounded tw:transition-colors tw:hover:bg-sidebar"
              :class="
                column.getIsPinned() === 'left'
                  ? 'tw:text-primary'
                  : 'tw:text-placeholder tw:hover:text-on-sidebar'
              "
              @click="togglePin(column)"
            >
              <component
                :is="column.getIsPinned() === 'left' ? IconPinFilled : IconPin"
                :size="13"
              />
            </button>
          </div>
        </div>
      </div>
    </template>
  </BasePopover>
</template>
