<script setup>
import { IconArrowLeft, IconSearch, IconBuilding, IconUsers } from '@tabler/icons-vue'
import { useImpersonate } from '@/composables/useImpersonate.js'
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  companyId: {
    type: String,
    required: true,
  },
})

const {
  companyDetail,
  companyUsers,
  companyUsersLoading,
  companyUsersSearch,
  fetchCompanyUsers,
  hasMoreUsers,
} = useImpersonate()

const debouncedSearch = refDebounced(companyUsersSearch, 400)

watch(debouncedSearch, () => {
  fetchCompanyUsers(props.companyId)
})

onMounted(() => {
  fetchCompanyUsers(props.companyId)
})

function loadMore() {
  fetchCompanyUsers(props.companyId, { append: true })
}
</script>

<template>
  <BasePage width="standard">
    <RouterLink
      :to="getCompanyPath('/admin/impersonate')"
      class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:text-secondary tw:hover:text-primary"
    >
      <IconArrowLeft :size="16" />
      Back
    </RouterLink>

    <PageHeader>
      <template #title>{{ companyDetail?.name || 'Company' }}</template>
    </PageHeader>

    <SafeTeleport to="#main-header-search">
      <div class="tw:relative tw:w-full">
        <IconSearch
          :size="18"
          class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
        />
        <BaseTextInput
          v-model="companyUsersSearch"
          placeholder="Search users..."
          class="tw:w-full tw:pl-9"
        />
      </div>
    </SafeTeleport>

    <!-- Company Details -->
    <div
      v-if="companyDetail"
      class="tw:flex tw:items-center tw:gap-4 tw:p-4 tw:border tw:border-divider tw:rounded-lg"
    >
      <div v-if="companyDetail.companyIconUrl" class="tw:flex-none">
        <img
          :src="companyDetail.companyIconUrl"
          alt="Company"
          class="tw:w-16 tw:h-16 tw:rounded-lg"
        />
      </div>
      <div
        v-else
        class="tw:bg-primary tw:flex tw:items-center tw:justify-center tw:rounded-lg tw:size-16 tw:text-white"
      >
        <IconBuilding :size="32" />
      </div>

      <div class="tw:flex-1">
        <div class="tw:text-xl tw:font-bold tw:text-on-main">{{ companyDetail.name }}</div>
        <div class="tw:text-sm tw:text-secondary">Code: {{ companyDetail.code }}</div>
        <div v-if="companyDetail.defaultTimeZone" class="tw:text-sm tw:text-secondary">
          Timezone: {{ companyDetail.defaultTimeZone }}
        </div>
      </div>
    </div>

    <!-- Users Section -->
    <div class="tw:text-base tw:font-semibold tw:text-on-main">
      Users ({{ companyUsers.length }}{{ hasMoreUsers ? '+' : '' }})
    </div>

    <div
      v-if="companyUsersLoading && companyUsers.length === 0"
      class="tw:flex tw:justify-center tw:p-8"
    >
      <BaseSpinner size="lg" />
    </div>

    <BaseEmptyState
      v-else-if="companyUsers.length === 0"
      :icon="IconUsers"
      title="No users found"
      dense
    />

    <template v-else>
      <ImpersonateList />

      <div v-if="hasMoreUsers" class="tw:flex tw:justify-center tw:py-4">
        <button
          class="tw:text-sm tw:font-medium tw:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:underline tw:disabled:opacity-50"
          :disabled="companyUsersLoading"
          @click="loadMore"
        >
          <BaseSpinner v-if="companyUsersLoading" size="sm" class="tw:mr-2" />
          Load More
        </button>
      </div>
    </template>
  </BasePage>
</template>
