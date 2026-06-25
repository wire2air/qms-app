<script setup>
/**
 * Column visibility manager. Engine-backed (reads/writes the TanStack column
 * model directly), so visibility is real engine state — restorable via the
 * table's `v-model`-able column state, not an ephemeral local Set. Replaces the
 * legacy per-table localStorage column hacks.
 *
 * (Reorder via drag + pinning land in a later increment.)
 */
import { IconColumns, IconCheck, IconRefresh, IconPin, IconPinFilled } from '@tabler/icons-vue'

const props = defineProps({
  // The TanStack table instance from DataTable (passed, never imported here).
  table: { type: Object, required: true },
})

const manageable = computed(() =>
  props.table.getAllLeafColumns().filter((c) => c.getCanHide() && c.columnDef.meta?.col?.label),
)
const visibleCount = computed(() => manageable.value.filter((c) => c.getIsVisible()).length)

function toggle(column) {
  // Never let the user hide the last visible column.
  if (column.getIsVisible() && visibleCount.value <= 1) return
  column.toggleVisibility(!column.getIsVisible())
}
function togglePin(column) {
  column.pin(column.getIsPinned() === 'left' ? false : 'left')
}
function reset() {
  props.table.resetColumnVisibility()
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
      <div class="tw:w-56 tw:p-1">
        <div
          class="tw:flex tw:items-center tw:justify-between tw:px-3 tw:py-1.5 tw:text-xs tw:font-semibold tw:tracking-wide tw:text-secondary tw:uppercase"
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
            class="tw:flex tw:flex-1 tw:items-center tw:justify-between tw:gap-2 tw:rounded-md tw:px-3 tw:py-2 tw:text-sm tw:text-on-sidebar"
            :class="
              column.getIsVisible() && visibleCount <= 1 ? 'tw:cursor-not-allowed tw:opacity-50' : ''
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
          <button
            type="button"
            :aria-pressed="column.getIsPinned() === 'left'"
            :title="column.getIsPinned() === 'left' ? 'Unpin column' : 'Pin column left'"
            class="tw:mr-1 tw:flex tw:size-7 tw:shrink-0 tw:items-center tw:justify-center tw:rounded tw:transition-colors tw:hover:bg-sidebar"
            :class="
              column.getIsPinned() === 'left'
                ? 'tw:text-primary'
                : 'tw:text-placeholder tw:hover:text-on-sidebar'
            "
            @click="togglePin(column)"
          >
            <component :is="column.getIsPinned() === 'left' ? IconPinFilled : IconPin" :size="14" />
          </button>
        </div>
      </div>
    </template>
  </BasePopover>
</template>
