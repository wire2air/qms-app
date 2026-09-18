<script setup>
import { IconBuilding } from '@tabler/icons-vue'
import { useImpersonate } from '@/composables/useImpersonate.js'

const { companies, loading, search, fetchCompanies, hasMore } = useImpersonate()

// Filters + resolved content state. Declared before the debounced watcher so its
// lazy getters read the axios-backed `companies`/`loading` refs. Rows come from an
// action/REST endpoint (not a syncEngine live query), so `state` is wired from the
// composable's own refs.
const list = useListLayout({
  filters: { search: '' },
  total: () => companies.value.length,
  loading: () => loading.value && companies.value.length === 0,
  empty: () => !loading.value && companies.value.length === 0,
})

// Keep the shared `useImpersonate.search` (consumed by fetchCompanies and the
// injected company list) in sync with the layout's filter state.
watch(
  () => list.filters.value.search,
  (q) => {
    search.value = q
  },
)

const debouncedSearch = refDebounced(search, 400)

watch(debouncedSearch, () => {
  fetchCompanies()
})

onMounted(() => {
  fetchCompanies()
})

function loadMore() {
  fetchCompanies({ append: true })
}
</script>

<template>
  <BaseListLayout
    title="Impersonate"
    :icon="IconBuilding"
    :state="list.state.value"
    :emptyIcon="IconBuilding"
    emptyTitle="No companies found"
  >
    <template #filters>
      <BaseFilterBar
        v-model:search="list.filters.value.search"
        searchPlaceholder="Search companies..."
        @clear="list.reset()"
      />
    </template>

    <ImpersonateCompanyList />

    <div v-if="hasMore" class="tw:flex tw:justify-center tw:py-4">
      <button
        class="tw:text-sm tw:font-medium tw:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:underline tw:disabled:opacity-50"
        :disabled="loading"
        @click="loadMore"
      >
        <BaseSpinner v-if="loading" size="sm" class="tw:mr-2" />
        Load More
      </button>
    </div>
  </BaseListLayout>
</template>
