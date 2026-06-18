import { ref } from 'vue'
import BasePagination from './BasePagination.vue'

/**
 * BasePagination — rows-per-page + range + prev/next pager (extracted from
 * BaseTable). Use for any paginated list, not just tables.
 */
export default {
  title: 'Data/BasePagination',
  component: BasePagination,
  tags: ['autodocs'],
  argTypes: { hideRowsPerPage: { control: 'boolean' } },
  args: { total: 137, hideRowsPerPage: false },
}

export const Default = {
  render: (args) => ({
    components: { BasePagination },
    setup() {
      const page = ref(1)
      const rowsPerPage = ref(25)
      return { args, page, rowsPerPage }
    },
    template: `
      <div class="tw:max-w-xl tw:rounded-xl tw:border tw:border-divider tw:bg-card tw:p-3">
        <BasePagination v-bind="args" v-model:page="page" v-model:rowsPerPage="rowsPerPage" />
      </div>`,
  }),
}

export const Compact = { ...Default, args: { hideRowsPerPage: true, total: 42 } }
