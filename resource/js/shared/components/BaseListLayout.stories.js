import { ref, computed } from 'vue'
import BaseListLayout from './BaseListLayout.vue'
import BaseTable from './BaseTable.vue'
import BaseFilterBar from './BaseFilterBar.vue'
import BaseQuickFilterPills from './BaseQuickFilterPills.vue'
import BaseButton from './BaseButton.vue'
import BaseBadge from './BaseBadge.vue'
import { useListLayout } from '../composables/useListLayout.js'
import { IconFileDescription, IconPlus, IconArchive, IconTrash } from '@tabler/icons-vue'

export default {
  title: 'Templates/List Page',
  component: BaseListLayout,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'List/index page template (Enterprise Page Framework A3). Pairs with the `useListLayout` composable to wire header, filters, quick-filter pills, a selection-aware bulk bar, pagination, and state-driven content (loading / error / empty / table) — so a list page declares only its filters, columns, and actions. See the State stories for the full range.',
      },
    },
  },
}

const COLUMNS = [
  { name: 'name', label: 'Name', field: 'name', align: 'left', sortable: true },
  { name: 'status', label: 'Status', field: 'status', align: 'left' },
  { name: 'site', label: 'Site', field: 'site', align: 'left' },
  { name: 'updatedAt', label: 'Updated', field: 'updatedAt', align: 'left', sortable: true },
]

const ROWS = [
  { id: '1', name: 'Cleaning Validation SOP', status: 'Active', site: 'Plant A', updatedAt: '2d ago' },
  { id: '2', name: 'Supplier Qualification', status: 'Draft', site: 'Plant B', updatedAt: '5d ago' },
  { id: '3', name: 'CAPA Procedure', status: 'Active', site: 'Plant A', updatedAt: '1w ago' },
  { id: '4', name: 'Internal Audit Checklist', status: 'Archived', site: 'HQ', updatedAt: '3w ago' },
  { id: '5', name: 'Calibration Schedule', status: 'Active', site: 'Plant C', updatedAt: '1mo ago' },
]

const QUICK_PILLS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active', count: 3 },
  { value: 'draft', label: 'Draft', count: 1 },
  { value: 'archived', label: 'Archived', count: 1 },
]

function baseStory({ rows = ROWS, force } = {}) {
  return {
    components: { BaseListLayout, BaseTable, BaseFilterBar, BaseQuickFilterPills, BaseButton, BaseBadge },
    setup() {
      const data = ref(rows)
      const list = useListLayout({
        filters: { search: '', quick: 'all' },
        total: () => data.value.length,
        loading: () => data.value === undefined,
        empty: () => data.value?.length === 0,
      })
      const state = computed(() => force ?? list.state.value)
      // Demo bulk selection by binding selected through the table.
      return { list, state, COLUMNS, data, QUICK_PILLS, IconFileDescription, IconPlus, IconArchive, IconTrash }
    },
    template: `
      <div style="height: 560px">
        <BaseListLayout
          title="Documents"
          :icon="IconFileDescription"
          :state="state"
          :selectedCount="list.selectedCount.value"
          emptyTitle="No documents match your filters"
        >
          <template #actions>
            <BaseButton variant="primary" size="sm"><IconPlus :size="16" /> New</BaseButton>
          </template>
          <template #filters>
            <BaseFilterBar v-model:search="list.filters.value.search" searchPlaceholder="Search documents…" />
          </template>
          <template #quick-filters>
            <BaseQuickFilterPills v-model="list.filters.value.quick" :pills="QUICK_PILLS" ariaLabel="Status" />
          </template>
          <template #bulk-actions="{ count }">
            <BaseButton size="sm"><IconArchive :size="16" /> Archive {{ count }}</BaseButton>
            <BaseButton size="sm" variant="danger"><IconTrash :size="16" /> Delete</BaseButton>
          </template>
          <BaseTable
            :rows="data"
            :columns="COLUMNS"
            rowKey="id"
            selectable
            v-model:pagination="list.pagination.value"
            v-model:selected="list.selected.value"
          >
            <template #body-cell-status="{ row }">
              <BaseBadge>{{ row.status }}</BaseBadge>
            </template>
          </BaseTable>
        </BaseListLayout>
      </div>`,
  }
}

export const Default = { render: () => baseStory() }

export const Empty = {
  name: 'Empty (no results)',
  render: () => baseStory({ rows: [], force: 'empty' }),
}

export const Loading = { render: () => baseStory({ force: 'loading' }) }

export const ErrorState = {
  name: 'Error',
  render: () => baseStory({ force: 'error' }),
}
