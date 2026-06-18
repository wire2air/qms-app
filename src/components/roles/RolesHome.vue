<script setup>
import { IconShield, IconPlus, IconSearch, IconFilter } from '@tabler/icons-vue'
import { useRoles } from '@/composables/useRoles.js'
import { isAllowed } from '@/utils/currentSession.js'

const { roles, loading, filters } = useRoles()
const showCreateDialog = ref(false)

const canCreateRole = computed(() => isAllowed(['roles:create']))

onMounted(() => {
  filters.value.statusId = null // Show all roles by default
})
</script>

<template>
  <BasePage width="standard">
    <PageHeader
      :icon="IconShield"
      title="Roles Administration"
      subtitle="Manage and define granular permissions for JSON-driven metadata templates."
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
    </PageHeader>

    <!-- Filter Toolbar -->
    <div class="tw:flex tw:items-center tw:gap-3">
      <div class="tw:relative tw:flex-1">
        <IconSearch
          :size="18"
          class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
        />
        <BaseTextInput
          v-model="filters.search"
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

    <!-- Roles List -->
    <RolesList :roles="roles" :loading="loading" />
  </BasePage>

  <!-- Create Role Dialog -->
  <RoleCreateDialog v-model="showCreateDialog" />
</template>
