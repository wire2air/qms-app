<script setup>
import { IconShield, IconPlus, IconSearch, IconFilter } from '@tabler/icons-vue'
import { useRoles } from '@/composables/useRoles.js'
import { isAllowed } from '@/utils/currentSession.js'

/**
 * Roles — admin list page.
 *
 * Built on the Enterprise Page Framework list template: `useListLayout`
 * (filter UI state + URL sync + resolved content state) + `BaseListLayout`
 * (header / filters / state region). Data + filtering still live in the
 * `useRoles()` provide/inject composable (axios-backed), which owns the
 * `roles`/`loading`/`filters` it returns; `useListLayout`'s filter ref drives
 * the toolbar and mirrors into that composable's `filters` so its existing
 * watch-and-refetch keeps working.
 */
const { roles, loading, filters: rolesFilters } = useRoles()
const showCreateDialog = ref(false)

const canCreateRole = computed(() => isAllowed(['roles:create']))

const list = useListLayout({
  filters: { search: '', statusId: null }, // Show all roles by default
  total: () => roles.value.length,
  loading: () => loading.value,
  empty: () => !loading.value && roles.value.length === 0,
  syncUrl: true,
})

// Mirror the layout's filter UI state into the useRoles composable, which owns
// the watch-and-refetch. Immediate so the "all roles" default applies on mount.
watch(
  list.filters,
  (f) => {
    rolesFilters.value.search = f.search
    rolesFilters.value.statusId = f.statusId
  },
  { deep: true, immediate: true },
)
</script>

<template>
  <BaseListLayout
    title="Roles Administration"
    :icon="IconShield"
    subtitle="Manage and define granular permissions for JSON-driven metadata templates."
    :state="list.state.value"
    :emptyIcon="IconShield"
    :emptyTitle="list.hasActiveFilters.value ? 'No roles match your filters' : 'No roles found'"
    emptyDescription="Create your first role to get started."
  >
    <template #actions>
      <button
        v-if="canCreateRole"
        class="tw:flex tw:items-center tw:gap-2 tw:px-4 tw:py-2 tw:bg-primary tw:text-white tw:font-bold tw:rounded-lg tw:hover:bg-primary/90 tw:transition-colors tw:border-0 tw:cursor-pointer"
        @click="showCreateDialog = true"
      >
        <IconPlus :size="18" />
        Create New Role
      </button>
    </template>

    <template #filters>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div class="tw:relative tw:flex-1">
          <IconSearch
            :size="18"
            class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
          />
          <BaseTextInput
            v-model="list.filters.value.search"
            placeholder="Search roles by name or description..."
            class="tw:pl-9"
          />
        </div>
        <button
          class="tw:p-2 tw:text-secondary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:text-on-main"
        >
          <IconFilter :size="20" />
        </button>
      </div>
    </template>

    <RolesList :roles="roles" :loading="false" />

    <RoleCreateDialog v-model="showCreateDialog" />
  </BaseListLayout>
</template>
