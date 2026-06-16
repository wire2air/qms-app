<script setup>
// TEMP dev page to verify Phase 3 BaseTable features. Route: /table-test
// Safe to delete once verified.
import { DateTime } from 'luxon'
import { IconTrash } from '@tabler/icons-vue'

const columns = [
  { name: 'name', label: 'Name', field: 'name', sortable: true, hideable: false },
  { name: 'status', label: 'Status', field: 'status', sortable: true },
  { name: 'qty', label: 'Qty', field: 'qty', sortable: true, align: 'right' },
  { name: 'created', label: 'Created', field: 'created', sortable: true },
]

const rows = [
  { id: 1, name: 'Boston Plant', status: 'Active', qty: 10, created: DateTime.local(2026, 1, 5) },
  { id: 2, name: 'Austin Facility', status: 'Pending', qty: 2, created: DateTime.local(2026, 3, 18) },
  { id: 3, name: 'Dublin Site', status: 'Active', qty: 100, created: DateTime.local(2025, 11, 2) },
  { id: 4, name: 'Tokyo Lab', status: 'Closed', qty: 25, created: DateTime.local(2026, 2, 27) },
  { id: 5, name: 'Berlin Depot', status: 'Active', qty: 7, created: DateTime.local(2026, 4, 9) },
]

const selected = ref([])
const pagination = ref({ page: 1, rowsPerPage: 10, sortBy: null, descending: false, total: null })
</script>

<template>
  <div class="tw:p-8 tw:space-y-4 tw:max-w-4xl">
    <h1 class="tw:text-2xl tw:font-bold tw:text-on-main">Phase 3 — BaseTable</h1>
    <p class="tw:text-sm tw:text-secondary">
      Selection + bulk bar · column toggle · density toggle · type-aware sort
      (Qty sorts numerically, Created by date). Selected ids: {{ selected }}
    </p>

    <BaseTable
      v-model:selected="selected"
      v-model:pagination="pagination"
      :columns="columns"
      :rows="rows"
      selectable
      columnToggle
      showDensityToggle
      maxHeight="50vh"
    >
      <template #bulk-actions="{ selected: sel, clear }">
        <button
          class="tw:flex tw:items-center tw:gap-1.5 tw:rounded-md tw:bg-bad tw:px-2.5 tw:py-1 tw:text-xs tw:font-semibold tw:text-white"
          @click="clear()"
        >
          <IconTrash :size="14" /> Delete {{ sel.length }}
        </button>
      </template>

      <template #body-cell-created="{ value }">
        {{ value.toFormat('LLL d, yyyy') }}
      </template>
    </BaseTable>
  </div>
</template>
