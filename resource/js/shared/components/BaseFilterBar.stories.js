import { ref } from 'vue'
import BaseFilterBar from './BaseFilterBar.vue'

/** Standard filter toolbar: a search box (v-model:search) + a #filters slot + optional Clear. */
export default {
  title: 'Navigation/BaseFilterBar',
  component: BaseFilterBar,
  tags: ['autodocs'],
  args: {
    searchPlaceholder: 'Search…',
    showClear: false,
    hideSearch: false,
  },
}

export const Default = {
  render: (args) => ({
    components: { BaseFilterBar },
    setup() {
      const search = ref('')
      return { args, search }
    },
    template: `
      <BaseFilterBar v-bind="args" v-model:search="search">
        <template #filters>
          <select class="tw:rounded-md tw:border tw:border-divider tw:px-2 tw:py-1.5 tw:text-sm">
            <option>All Sites</option>
            <option>London</option>
            <option>Arlington</option>
          </select>
          <select class="tw:rounded-md tw:border tw:border-divider tw:px-2 tw:py-1.5 tw:text-sm">
            <option>All Statuses</option>
            <option>Open</option>
            <option>Closed</option>
          </select>
        </template>
      </BaseFilterBar>`,
  }),
}

export const WithClear = {
  args: { showClear: true },
  render: (args) => ({
    components: { BaseFilterBar },
    setup() {
      const search = ref('audit')
      function reset() {
        search.value = ''
      }
      return { args, search, reset }
    },
    template: `
      <BaseFilterBar v-bind="args" v-model:search="search" @clear="reset">
        <template #filters>
          <select class="tw:rounded-md tw:border tw:border-divider tw:px-2 tw:py-1.5 tw:text-sm">
            <option>All Sites</option>
            <option>London</option>
          </select>
        </template>
      </BaseFilterBar>`,
  }),
}

export const WithActions = {
  render: (args) => ({
    components: { BaseFilterBar },
    setup() {
      const search = ref('')
      return { args, search }
    },
    template: `
      <BaseFilterBar v-bind="args" v-model:search="search">
        <template #filters>
          <select class="tw:rounded-md tw:border tw:border-divider tw:px-2 tw:py-1.5 tw:text-sm">
            <option>All Departments</option>
            <option>Quality</option>
          </select>
        </template>
        <template #actions>
          <button class="tw:rounded-md tw:bg-primary tw:px-3 tw:py-1.5 tw:text-sm tw:font-medium tw:text-on-primary">
            New
          </button>
        </template>
      </BaseFilterBar>`,
  }),
}

export const FiltersOnly = {
  args: { hideSearch: true },
  render: (args) => ({
    components: { BaseFilterBar },
    setup() {
      const search = ref('')
      return { args, search }
    },
    template: `
      <BaseFilterBar v-bind="args" v-model:search="search">
        <template #filters>
          <select class="tw:rounded-md tw:border tw:border-divider tw:px-2 tw:py-1.5 tw:text-sm">
            <option>All Sites</option>
            <option>London</option>
          </select>
          <select class="tw:rounded-md tw:border tw:border-divider tw:px-2 tw:py-1.5 tw:text-sm">
            <option>All Roles</option>
            <option>Admin</option>
          </select>
        </template>
      </BaseFilterBar>`,
  }),
}
