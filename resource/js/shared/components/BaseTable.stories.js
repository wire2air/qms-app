import { ref } from 'vue'
import BaseTable from './BaseTable.vue'

/** Data table with sorting, pagination, selection, column toggle, and density controls. */
export default {
  title: 'Data/BaseTable',
  component: BaseTable,
  tags: ['autodocs'],
  args: {
    rowKey: 'id',
    noDataLabel: 'No data available',
  },
}

// columns: { name, label, field (string|fn), sortable?, align?, hideable? }
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
    components: { BaseTable },
    setup() {
      return { args, columns, rows }
    },
    template: `<BaseTable v-bind="args" :columns="columns" :rows="rows" />`,
  }),
}

export const CustomCellSlot = {
  render: (args) => ({
    components: { BaseTable },
    setup() {
      return { args, columns, rows }
    },
    template: `
      <BaseTable v-bind="args" :columns="columns" :rows="rows">
        <template #body-cell-count="{ value }">
          <span class="tw:font-bold tw:text-primary">{{ value }}</span>
        </template>
      </BaseTable>`,
  }),
}

export const Selectable = {
  args: { selectable: true, columnToggle: true, showDensityToggle: true },
  render: (args) => ({
    components: { BaseTable },
    setup() {
      const selected = ref([1, 3])
      return { args, columns, rows, selected }
    },
    template: `
      <BaseTable v-bind="args" :columns="columns" :rows="rows" v-model:selected="selected">
        <template #bulk-actions="{ selected, clear }">
          <button class="tw:rounded-md tw:px-2 tw:py-1 tw:text-xs tw:font-medium tw:text-primary" @click="clear">
            Clear {{ selected.length }}
          </button>
        </template>
      </BaseTable>`,
  }),
}

/**
 * Rows become keyboard-operable when a `@row-click` listener is attached: each row
 * is focusable (Tab), shows a focus ring, and activates on Enter/Space or click
 * (rule #8 / WCAG 2.1.1, 4.1.2). Tab through the rows and press Enter to try it.
 */
export const InteractiveRows = {
  render: (args) => ({
    components: { BaseTable },
    setup() {
      const lastClicked = ref(null)
      function onRowClick(row) {
        lastClicked.value = row.name
      }
      return { args, columns, rows, lastClicked, onRowClick }
    },
    template: `
      <div class="tw:flex tw:flex-col tw:gap-3">
        <p class="tw:text-sm tw:text-secondary">
          Last activated: <span class="tw:font-semibold tw:text-on-main">{{ lastClicked ?? '—' }}</span>
        </p>
        <BaseTable v-bind="args" :columns="columns" :rows="rows" @row-click="onRowClick" />
      </div>`,
  }),
}

export const Loading = {
  args: { loading: true },
  render: (args) => ({
    components: { BaseTable },
    setup() {
      return { args, columns, rows }
    },
    template: `<BaseTable v-bind="args" :columns="columns" :rows="rows" />`,
  }),
}

export const Empty = {
  args: { noDataLabel: 'No people match your filters' },
  render: (args) => ({
    components: { BaseTable },
    setup() {
      return { args, columns }
    },
    template: `<BaseTable v-bind="args" :columns="columns" :rows="[]" />`,
  }),
}
