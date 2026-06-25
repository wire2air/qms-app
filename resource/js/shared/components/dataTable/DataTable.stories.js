import { ref } from 'vue'
import { IconEye, IconEdit, IconCopy, IconTrash } from '@tabler/icons-vue'
import DataTable from './DataTable.vue'

/**
 * DataTable — the enterprise table shell (Phase 0 of the rebuild). Engine-backed by
 * TanStack v8 (`useDataTable`) but cells render through `#body-cell-{name}` slots,
 * exactly like the legacy BaseTable. Toggle the global Theme control for dark mode.
 */
export default {
  title: 'Data/DataTable',
  component: DataTable,
  tags: ['autodocs'],
  args: {
    rowKey: 'id',
    ariaLabel: 'People',
  },
}

const columns = [
  { name: 'name', label: 'Name', field: 'name', sortable: true },
  { name: 'role', label: 'Role', field: 'role', sortable: true },
  { name: 'site', label: 'Site', field: (row) => row.site?.name, sortable: true },
  { name: 'count', label: 'Open Tasks', field: 'count', sortable: true, align: 'right' },
]

const rows = [
  { id: 1, name: 'Ada Lovelace', role: 'Engineer', site: { name: 'London' }, count: 4 },
  { id: 2, name: 'Grace Hopper', role: 'Admiral', site: { name: 'Arlington' }, count: 12 },
  { id: 3, name: 'Alan Turing', role: 'Cryptographer', site: { name: 'Bletchley' }, count: 7 },
  { id: 4, name: 'Katherine Johnson', role: 'Mathematician', site: { name: 'Hampton' }, count: 2 },
  { id: 5, name: 'Linus Torvalds', role: 'Engineer', site: { name: 'Portland' }, count: 9 },
]

export const Default = {
  render: (args) => ({
    components: { DataTable },
    setup: () => ({ args, columns, rows }),
    template: `<DataTable v-bind="args" :columns="columns" :rows="rows" />`,
  }),
}

export const CustomCellSlot = {
  render: (args) => ({
    components: { DataTable },
    setup: () => ({ args, columns, rows }),
    template: `
      <DataTable v-bind="args" :columns="columns" :rows="rows">
        <template #body-cell-count="{ value }">
          <span class="tw:font-bold tw:text-primary">{{ value }}</span>
        </template>
      </DataTable>`,
  }),
}

/** Shift-click headers to stack multiple sort keys; the badge shows sort priority. */
export const MultiSort = {
  args: { multiSort: true },
  render: (args) => ({
    components: { DataTable },
    setup: () => ({ args, columns, rows }),
    template: `<DataTable v-bind="args" :columns="columns" :rows="rows" />`,
  }),
}

export const Selection = {
  args: { selectable: true },
  render: (args) => ({
    components: { DataTable },
    setup() {
      const selected = ref([2])
      return { args, columns, rows, selected }
    },
    template: `
      <div class="tw:flex tw:flex-col tw:gap-2">
        <p class="tw:text-sm tw:text-secondary">Selected: {{ selected.join(', ') || 'none' }}</p>
        <DataTable v-bind="args" :columns="columns" :rows="rows" v-model:selected="selected" />
      </div>`,
  }),
}

export const Comfortable = {
  args: { density: 'comfortable' },
  render: (args) => ({
    components: { DataTable },
    setup: () => ({ args, columns, rows }),
    template: `<DataTable v-bind="args" :columns="columns" :rows="rows" />`,
  }),
}
export const Cozy = { ...Comfortable, args: { density: 'cozy' } }
export const Compact = { ...Comfortable, args: { density: 'compact' } }

export const Loading = {
  args: { loading: true },
  render: (args) => ({
    components: { DataTable },
    setup: () => ({ args, columns }),
    template: `<DataTable v-bind="args" :columns="columns" :rows="[]" />`,
  }),
}

export const Empty = {
  render: (args) => ({
    components: { DataTable },
    setup: () => ({ args, columns }),
    template: `<DataTable v-bind="args" :columns="columns" :rows="[]" no-data-label="No people yet" />`,
  }),
}

/** Data exists but the search filters everything out — distinct from truly empty. */
export const NoResults = {
  render: (args) => ({
    components: { DataTable },
    setup: () => ({ args, columns, rows }),
    template: `<DataTable v-bind="args" :columns="columns" :rows="rows" search="zzzz" />`,
  }),
}

export const ErrorState = {
  args: { error: 'Request failed with status 500' },
  render: (args) => ({
    components: { DataTable },
    setup: () => ({ args, columns, rows }),
    template: `<DataTable v-bind="args" :columns="columns" :rows="rows" />`,
  }),
}

export const PermissionDenied = {
  args: { state: 'denied' },
  render: (args) => ({
    components: { DataTable },
    setup: () => ({ args, columns, rows }),
    template: `<DataTable v-bind="args" :columns="columns" :rows="rows" />`,
  }),
}

export const Offline = {
  args: { state: 'offline' },
  render: (args) => ({
    components: { DataTable },
    setup: () => ({ args, columns, rows }),
    template: `<DataTable v-bind="args" :columns="columns" :rows="rows" />`,
  }),
}

/** 10,000 rows. The engine sorts/paginates in memory; only one page is in the DOM. */
export const LargeDataset = {
  render: (args) => ({
    components: { DataTable },
    setup() {
      const roles = ['Engineer', 'Analyst', 'Admiral', 'Scientist', 'Manager']
      const sites = ['London', 'Portland', 'Hampton', 'Arlington', 'Bletchley']
      const big = Array.from({ length: 10000 }, (_, i) => ({
        id: i + 1,
        name: `Person ${String(i + 1).padStart(5, '0')}`,
        role: roles[i % roles.length],
        site: { name: sites[i % sites.length] },
        count: (i * 7) % 50,
      }))
      const pagination = ref({ page: 1, pageSize: 25 })
      return { args, columns, big, pagination }
    },
    template: `<DataTable v-bind="args" :columns="columns" :rows="big" v-model:pagination="pagination" />`,
  }),
}

/** The full toolbar: debounced search, density picker, column manager, and a
 * config-driven bulk-action bar that appears once rows are selected. */
export const FullToolbar = {
  args: { searchable: true, densitySelector: true, columnManager: true, selectable: true },
  render: (args) => ({
    components: { DataTable },
    setup() {
      const selected = ref([])
      const bulkActions = [
        { key: 'export', label: 'Export', variant: 'outline', run: (s) => alert('Export ' + s.length) },
        {
          key: 'archive',
          label: 'Archive',
          variant: 'danger',
          run: (s) => alert('Archive ' + s.join(', ')),
        },
      ]
      return { args, columns, rows, selected, bulkActions }
    },
    template: `<DataTable v-bind="args" :columns="columns" :rows="rows" :bulk-actions="bulkActions" v-model:selected="selected" />`,
  }),
}

/** 10,000 rows, row-windowed with @tanstack/vue-virtual — only the visible window
 * (plus overscan) is in the DOM. Scroll the internal region; pagination is replaced. */
export const Virtualized = {
  render: (args) => ({
    components: { DataTable },
    setup() {
      const roles = ['Engineer', 'Analyst', 'Admiral', 'Scientist', 'Manager']
      const sites = ['London', 'Portland', 'Hampton', 'Arlington', 'Bletchley']
      const big = Array.from({ length: 10000 }, (_, i) => ({
        id: i + 1,
        name: `Person ${String(i + 1).padStart(5, '0')}`,
        role: roles[i % roles.length],
        site: { name: sites[i % sites.length] },
        count: (i * 7) % 50,
      }))
      return { args, columns, big }
    },
    template: `<DataTable v-bind="args" :columns="columns" :rows="big" virtualize max-height="440px" />`,
  }),
}

/**
 * Below the `md` breakpoint the table renders as stacked cards driven by each
 * column's `mobile` priority (`primary` / `secondary` / `meta` / `hidden`).
 * Narrow the canvas under 768px (or use the viewport toolbar) to see it.
 */
export const MobileCards = {
  render: (args) => ({
    components: { DataTable },
    setup() {
      const mobileColumns = [
        { name: 'name', label: 'Name', field: 'name', sortable: true, mobile: 'primary' },
        { name: 'role', label: 'Role', field: 'role', sortable: true, mobile: 'secondary' },
        { name: 'site', label: 'Site', field: (r) => r.site?.name, mobile: 'meta' },
        { name: 'count', label: 'Open Tasks', field: 'count', align: 'right', mobile: 'meta' },
      ]
      const last = ref(null)
      return { args, mobileColumns, rows, last, onRowClick: (r) => (last.value = r.name) }
    },
    template: `
      <div class="tw:flex tw:flex-col tw:gap-2">
        <p class="tw:text-sm tw:text-secondary">Opened: <b class="tw:text-on-main">{{ last ?? '—' }}</b></p>
        <DataTable v-bind="args" :columns="mobileColumns" :rows="rows" @row-click="onRowClick" />
      </div>`,
  }),
}

/** Per-row actions from one config: the first two are inline quick actions, the
 * rest collapse into an overflow menu. `danger` styles destructive actions; a
 * `visible(row)` predicate gates by permission/state. */
export const RowActions = {
  render: (args) => ({
    components: { DataTable },
    setup() {
      const rowActions = [
        { key: 'view', label: 'View', icon: IconEye, onClick: (r) => alert('View ' + r.name) },
        { key: 'edit', label: 'Edit', icon: IconEdit, onClick: (r) => alert('Edit ' + r.name) },
        { key: 'copy', label: 'Duplicate', icon: IconCopy, onClick: (r) => alert('Copy ' + r.name) },
        {
          key: 'delete',
          label: 'Delete',
          icon: IconTrash,
          danger: true,
          onClick: (r) => alert('Delete ' + r.name),
        },
      ]
      return { args, columns, rows, rowActions }
    },
    template: `<DataTable v-bind="args" :columns="columns" :rows="rows" :row-actions="rowActions" />`,
  }),
}

/** Sticky pinned columns. `Name` is pinned left and `Open Tasks` right (via the
 * column `pin` def, or the pin toggle in the column manager). Scroll horizontally. */
export const PinnedColumns = {
  render: (args) => ({
    components: { DataTable },
    setup() {
      const wideColumns = [
        { name: 'name', label: 'Name', field: 'name', sortable: true, pin: 'left', width: 200 },
        { name: 'role', label: 'Role', field: 'role', sortable: true, width: 200 },
        { name: 'site', label: 'Site', field: (r) => r.site?.name, width: 200 },
        { name: 'team', label: 'Team', field: 'role', width: 200 },
        { name: 'region', label: 'Region', field: (r) => r.site?.name, width: 200 },
        {
          name: 'count',
          label: 'Open Tasks',
          field: 'count',
          align: 'right',
          sortable: true,
          pin: 'right',
          width: 160,
        },
      ]
      return { args, wideColumns, rows }
    },
    template: `<DataTable v-bind="args" :columns="wideColumns" :rows="rows" column-manager />`,
  }),
}

/** Linear-style filters: click "Filter", pick a field, choose an operator + value.
 * Chips join with a clickable AND/OR connector. Operators adapt to each column's
 * `filterType` (text / number / select). */
export const Filters = {
  args: { filterable: true },
  render: (args) => ({
    components: { DataTable },
    setup() {
      const filterColumns = [
        { name: 'name', label: 'Name', field: 'name', sortable: true, filterType: 'text' },
        {
          name: 'role',
          label: 'Role',
          field: 'role',
          sortable: true,
          filterType: 'select',
          filterOptions: ['Engineer', 'Admiral', 'Cryptographer', 'Mathematician'],
        },
        { name: 'site', label: 'Site', field: (r) => r.site?.name, filterType: 'text' },
        {
          name: 'count',
          label: 'Open Tasks',
          field: 'count',
          align: 'right',
          sortable: true,
          filterType: 'number',
        },
      ]
      return { args, filterColumns, rows }
    },
    template: `<DataTable v-bind="args" :columns="filterColumns" :rows="rows" />`,
  }),
}

/** Expandable detail rows via the `#row-detail` slot. `expandable` can be a
 * predicate to gate which rows expand. */
export const ExpandableRows = {
  args: { expandable: true },
  render: (args) => ({
    components: { DataTable },
    setup: () => ({ args, columns, rows }),
    template: `
      <DataTable v-bind="args" :columns="columns" :rows="rows">
        <template #row-detail="{ row }">
          <div class="tw:flex tw:flex-col tw:gap-1 tw:text-sm">
            <p class="tw:font-semibold tw:text-on-main">{{ row.name }} — details</p>
            <p class="tw:text-secondary">Role: {{ row.role }} · Site: {{ row.site?.name }} · Open tasks: {{ row.count }}</p>
          </div>
        </template>
      </DataTable>`,
  }),
}

/** Drag the right edge of any header to resize. Uses a fixed table layout while on;
 * columns can opt out with `resizable: false`. Export the filtered/sorted rows as CSV. */
export const ResizableAndExport = {
  args: { resizableColumns: true, exportable: true, searchable: true },
  render: (args) => ({
    components: { DataTable },
    setup: () => ({ args, columns, rows }),
    template: `<DataTable v-bind="args" :columns="columns" :rows="rows" export-filename="people.csv" />`,
  }),
}

/** Rows become keyboard-operable when a row-click listener is attached (Tab + Enter/Space). */
export const InteractiveRows = {
  render: (args) => ({
    components: { DataTable },
    setup() {
      const last = ref(null)
      return { args, columns, rows, last, onRowClick: (r) => (last.value = r.name) }
    },
    template: `
      <div class="tw:flex tw:flex-col tw:gap-2">
        <p class="tw:text-sm tw:text-secondary">Activated: <b class="tw:text-on-main">{{ last ?? '—' }}</b></p>
        <DataTable v-bind="args" :columns="columns" :rows="rows" @row-click="onRowClick" />
      </div>`,
  }),
}
