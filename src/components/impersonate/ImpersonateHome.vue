<script setup>
import { IconSearch, IconBuilding } from '@tabler/icons-vue'
import { useImpersonate } from '@/composables/useImpersonate.js'

const { companies, loading, search, fetchCompanies, hasMore } = useImpersonate()

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
  <BasePage width="standard" density="compact">
    <SafeTeleport to="#main-header-title">
      <div class="tw:text-lg tw:font-bold tw:text-on-main">Impersonate</div>
    </SafeTeleport>

    <SafeTeleport to="#main-header-search">
      <div class="tw:relative tw:w-full">
        <IconSearch
          :size="18"
          class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
        />
        <BaseTextInput
          v-model="search"
          placeholder="Search companies..."
          class="tw:w-full tw:pl-9"
        />
      </div>
    </SafeTeleport>

    <div v-if="loading && companies.length === 0" class="tw:flex tw:justify-center tw:p-8">
      <BaseSpinner size="lg" />
    </div>

    <BaseEmptyState
      v-else-if="companies.length === 0"
      :icon="IconBuilding"
      title="No companies found"
      dense
    />

    <template v-else>
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
    </template>
  </BasePage>
</template>
