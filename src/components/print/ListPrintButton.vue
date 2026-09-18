<script setup>
/**
 * "Print" for a list page — a button with two choices: what you're looking at,
 * or the whole register.
 *
 * Both are needed and neither substitutes for the other. "Current view" is the
 * one people reach for (print the overdue CAPAs for a meeting); "All records"
 * is what an auditor asks for, and getting it by clearing every filter first is
 * exactly the kind of manual step that produces a register with something
 * quietly missing.
 *
 * Wraps useListPrint so all eight list pages get the same affordance and the
 * same wording. See composables/useListPrint.js for the handoff mechanics.
 */
import { IconPrinter, IconListDetails, IconDatabase } from '@tabler/icons-vue'
import { useListPrint } from '@/composables/useListPrint.js'

const props = defineProps({
  /** SyncEngine model name — must have an entry in RecordListPrint's REGISTERS. */
  entity: { type: String, required: true },
  /** Heading for the printout, e.g. 'CAPA Register'. */
  title: { type: String, default: null },
  /** The rows currently listed, in display order. */
  rows: { type: Array, default: () => [] },
  /** Human label for the active quick view, printed as the page's caption. */
  filterLabel: { type: String, default: '' },
  size: { type: String, default: 'md' },
})

const { printCurrent, printAll } = useListPrint({
  entity: props.entity,
  title: props.title,
  rows: () => props.rows,
  filterLabel: () => props.filterLabel,
})

function run(action, close) {
  close?.()
  action()
}
</script>

<template>
  <BasePopover placement="bottom-end">
    <template #button>
      <BaseButton variant="outline" :size="size" type="button">
        <template #icon><IconPrinter :size="16" /></template>
        Print
      </BaseButton>
    </template>

    <template #content="{ close }">
      <div class="tw:flex tw:flex-col tw:py-1 tw:min-w-56">
        <button
          type="button"
          class="tw:flex tw:items-start tw:gap-2.5 tw:px-3 tw:py-2 tw:text-left tw:hover:bg-main-hover"
          @click="run(printCurrent, close)"
        >
          <IconListDetails :size="16" class="tw:mt-0.5 tw:shrink-0 tw:text-secondary" />
          <span>
            <span class="tw:block tw:text-sm tw:text-on-main">Current view</span>
            <span class="tw:block tw:text-xs tw:text-secondary">
              {{ rows.length }} record{{ rows.length === 1 ? '' : 's' }} as filtered
            </span>
          </span>
        </button>
        <button
          type="button"
          class="tw:flex tw:items-start tw:gap-2.5 tw:px-3 tw:py-2 tw:text-left tw:hover:bg-main-hover"
          @click="run(printAll, close)"
        >
          <IconDatabase :size="16" class="tw:mt-0.5 tw:shrink-0 tw:text-secondary" />
          <span>
            <span class="tw:block tw:text-sm tw:text-on-main">All records</span>
            <span class="tw:block tw:text-xs tw:text-secondary">Ignores the active filters</span>
          </span>
        </button>
      </div>
    </template>
  </BasePopover>
</template>
