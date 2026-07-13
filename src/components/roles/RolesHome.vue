<script setup>
import { IconShield, IconPlus } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'

/**
 * Roles — admin list page (C3: syncEngine-backed).
 *
 * The list reads live from the syncEngine (`db.Role` + `db.RoleOnUser` for the
 * per-role user count) so it stays consistent across tabs. Activate/Deactivate
 * persist through the model's `.save()` (DB lock trigger blocks a locked role).
 * The detail page (RolePageId) + create dialog still use the axios `useRoles`
 * layer (explicit-save flow); their writes reflect here via sync broadcasts.
 */
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

// Live data.
const roleList = useLiveQuery((db) => db.Role.where().exec(), { models: ['Role'] })
const roleUsers = useLiveQuery((db) => db.RoleOnUser.where().exec(), {
  models: ['RoleOnUser'],
  initial: [],
})
const loading = computed(() => roleList.value === undefined)

const countByRole = computed(() => {
  const m = {}
  for (const ru of roleUsers.value || []) m[ru.roleId] = (m[ru.roleId] || 0) + 1
  return m
})

// Plain display rows (with userCount) for the table.
const rows = computed(() =>
  (roleList.value || []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    statusId: r.statusId,
    updatedAt: r.updatedAt,
    locked: r.locked,
    userCount: countByRole.value[r.id] || 0,
  })),
)

const list = useListLayout({
  filters: {},
  total: () => rows.value.length,
  loading: () => loading.value,
  empty: () => !loading.value && rows.value.length === 0,
  syncUrl: true,
})

// Status change persists via the live model instance; the DB lock trigger
// rejects a locked role (surfaced as an error toast).
async function setStatus(roleRow, statusId) {
  const inst = (roleList.value || []).find((r) => r.id === roleRow.id)
  if (!inst) return false
  inst.statusId = statusId
  try {
    await inst.save()
    return true
  } catch (err) {
    toast.error(err?.message || 'Failed to update role')
    return false
  }
}

async function onActivate(role) {
  const ok = await confirm({
    title: 'Activate Role',
    message: `Are you sure you want to activate the role "${role.name}"?`,
    okLabel: 'Activate',
  })
  if (!ok) return
  if (await setStatus(role, 'ACTIVE')) toast.success('Role activated successfully')
}

async function onDeactivate(role) {
  const ok = await confirm({
    title: 'Deactivate Role',
    message: `Are you sure you want to deactivate the role "${role.name}"? This will set its status to Inactive.`,
    okLabel: 'Deactivate',
    danger: true,
  })
  if (!ok) return
  if (await setStatus(role, 'INACTIVE')) toast.success('Role deactivated successfully')
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
      :rows="rows"
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
