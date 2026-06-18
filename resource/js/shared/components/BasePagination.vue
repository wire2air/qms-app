<script setup>
/**
 * BasePagination — the rows-per-page + range + prev/next pager, extracted from
 * BaseTable so non-table lists (card grids, custom lists) can paginate with the
 * same control. Rendered as a labelled <nav>.
 *
 *   <BasePagination v-model:page="page" v-model:rowsPerPage="rpp" :total="total" />
 *
 * v-model:page and v-model:rowsPerPage are separate so it composes anywhere;
 * BaseTable adapts its single `pagination` object onto these.
 */
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-vue'

const props = defineProps({
  total: { type: Number, default: 0 },
  rowsPerPageOptions: { type: Array, default: () => [5, 10, 25, 50] },
  hideRowsPerPage: { type: Boolean, default: false },
})

const page = defineModel('page', { type: Number, default: 1 })
const rowsPerPage = defineModel('rowsPerPage', { type: Number, default: 50 })

// Pagination math lives in a unit-tested composable, reusable by non-table lists.
const { totalPages, label, go, setRowsPerPage } = usePagination(page, rowsPerPage, () => props.total)

function changeSize(e) {
  setRowsPerPage(parseInt(e.target.value, 10))
}
</script>

<template>
  <nav
    aria-label="Pagination"
    class="tw:flex tw:items-center tw:justify-between tw:gap-6 tw:text-xs tw:text-secondary sm:tw:justify-end"
  >
    <div v-if="!hideRowsPerPage" class="tw:flex tw:items-center tw:gap-2">
      <label>Rows per page:</label>
      <select :value="rowsPerPage" @change="changeSize">
        <option v-for="n in rowsPerPageOptions" :key="n" :value="n">{{ n }}</option>
      </select>
    </div>

    <div class="tw:flex tw:items-center tw:gap-4">
      <span class="tw:font-medium tw:text-on-main">{{ label }}</span>
      <div class="tw:flex tw:items-center tw:gap-1">
        <button
          type="button"
          :disabled="page <= 1"
          aria-label="Previous page"
          class="tw:rounded tw:p-1.5 tw:transition-colors tw:hover:bg-main-hover tw:disabled:cursor-not-allowed tw:disabled:opacity-30 tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40"
          @click="go(page - 1)"
        >
          <IconChevronLeft :size="16" />
        </button>
        <button
          type="button"
          :disabled="page >= totalPages"
          aria-label="Next page"
          class="tw:rounded tw:p-1.5 tw:transition-colors tw:hover:bg-main-hover tw:disabled:cursor-not-allowed tw:disabled:opacity-30 tw:focus-visible:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40"
          @click="go(page + 1)"
        >
          <IconChevronRight :size="16" />
        </button>
      </div>
    </div>
  </nav>
</template>
