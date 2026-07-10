<script setup>
import { IconShield, IconPlus } from '@tabler/icons-vue'
import { useRoles } from '@/composables/useRoles.js'
import { isAllowed } from '@/utils/currentSession.js'

/**
 * Roles — admin list page.
 *
 * Built on the Enterprise Page Framework list template: `useListLayout`
 * (resolved content state) + `BaseListLayout` (header / state region). Data
 * lives in the `useRoles()` provide/inject composable (axios-backed), which
 * owns `roles`/`loading` and provides `userCount` per role. The list itself is
 * a `DataTable` (RolesTable) with built-in search / sort / filter / export —
 * matching SitesTable and the other admin lists.
 */
// useRoles fetches on mount (its currentCompany watch is immediate) and provides
// userCount per role. Search / sort / filter now happen client-side in the DataTable.
const { roles, loading, activateRole, deactivateRole } = useRoles()
const showCreateDialog = ref(false)
const cloneSource = ref(null)

function openCreate() {
  cloneSource.value = null
  showCreateDialog.value = true
}

function onClone(role) {
  cloneSource.value = role
  showCreateDialog.value = true
}

const toast = useToast()
const { confirm } = useConfirm()

const canCreateRole = computed(() => isAllowed(['role_permission_management:create']))
const canUpdateRole = computed(() => isAllowed(['role_permission_management:update']))

const list = useListLayout({
  filters: {},
  total: () => roles.value.length,
  loading: () => loading.value,
  empty: () => !loading.value && roles.value.length === 0,
  syncUrl: true,
})

async function onActivate(role) {
  const ok = await confirm({
    title: 'Activate Role',
    message: `Are you sure you want to activate the role "${role.name}"?`,
    okLabel: 'Activate',
  })
  if (!ok) return
  const success = await activateRole(role.id)
  toast[success ? 'success' : 'error'](
    success ? 'Role activated successfully' : 'Failed to activate role',
  )
}

async function onDeactivate(role) {
  const ok = await confirm({
    title: 'Deactivate Role',
    message: `Are you sure you want to deactivate the role "${role.name}"? This will set its status to Inactive.`,
    okLabel: 'Deactivate',
    danger: true,
  })
  if (!ok) return
  const success = await deactivateRole(role.id)
  toast[success ? 'success' : 'error'](
    success ? 'Role deactivated successfully' : 'Failed to deactivate role',
  )
}
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
        @click="openCreate"
      >
        <IconPlus :size="18" />
        Create New Role
      </button>
    </template>

    <RolesTable
      :rows="roles"
      :loading="loading"
      :canUpdate="canUpdateRole"
      :canCreate="canCreateRole"
      @activate="onActivate"
      @deactivate="onDeactivate"
      @clone="onClone"
    />
  </BaseListLayout>

  <!-- Kept OUTSIDE BaseListLayout: its content slot only renders in the `ready`
       state, so leaving the dialog inside would unmount it whenever creating a
       role flips the shared `loading` ref (the list shows its skeleton),
       remounting a fresh dialog and re-opening it. -->
  <RoleCreateDialog v-model="showCreateDialog" :cloneSource="cloneSource" />
</template>
