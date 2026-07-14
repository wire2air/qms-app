<script setup>
import { IconHistory, IconSearch, IconLock } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { isAllowed } from '@/utils/currentSession.js'
import { buildRoleSections, buildRoleActions } from './roleDetailConfig.js'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const toast = useToast()
const router = useRouter()
const { confirm } = useConfirm()
const role = ref(null)
const loading = ref(false)

// Snapshot of the last-saved name/description, to detect unsaved edits (M4).
const savedMeta = ref({ name: '', description: '' })
const metaDirty = computed(
  () =>
    !!role.value &&
    (role.value.name !== savedMeta.value.name ||
      (role.value.description ?? '') !== savedMeta.value.description),
)

const canUpdateRole = computed(() => isAllowed(['role_permission_management:update']))
// A locked role is protected — editing controls are disabled until it's unlocked.
const isLocked = computed(() => !!role.value?.locked)
const canEdit = computed(() => canUpdateRole.value && !isLocked.value)

// Live source of truth (pooled db.Role instance) + a plain-object editable copy
// (`role`). Inline edits mutate the copy only; Save applies it to the instance
// and persists, so Cancel/discard never leaves a dirty pooled instance.
const liveRole = useLiveQueryWithDeps([() => props.id], (db, [id]) =>
  id ? db.Role.findByPk(id) : null,
)
const roleAssignments = useLiveQueryWithDeps(
  [() => props.id],
  (db, [id]) => (id ? db.RoleOnUser.where('roleId', id).exec() : []),
  { initial: [] },
)
const initialLoading = computed(() => liveRole.value === undefined)
const notFound = computed(() => liveRole.value === null)

watch(
  liveRole,
  (r) => {
    if (!r) return
    // Seed/refresh the editable copy when switching roles or when there are no
    // unsaved edits (don't clobber the user's in-progress changes on a sync push).
    if (!role.value || role.value.id !== r.id || !metaDirty.value) {
      role.value = {
        id: r.id,
        name: r.name,
        description: r.description,
        statusId: r.statusId,
        locked: r.locked,
        companyId: r.companyId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }
      savedMeta.value = { name: r.name ?? '', description: r.description ?? '' }
    }
  },
  { immediate: true },
)

// Inline editing state
const isEditingName = ref(false)
const isEditingDescription = ref(false)
const editedName = ref('')
const editedDescription = ref('')
const nameInputRef = ref(null)
const descriptionInputRef = ref(null)

// User assignment dialog
const showUsersDialog = ref(false)
// Access-history drawer (M5)
const showAudit = ref(false)

// Permission matrix (self-contained; persisted via its exposed save()).
const matrixRef = ref(null)
const permSearch = ref('')

const breadcrumbItems = computed(() => [
  { label: 'Roles', to: getCompanyPath('/roles') },
  { label: role.value?.name || 'Role Details' },
])

const usersCount = computed(() => roleAssignments.value.length)

// The dialog seeds its selection + "currently assigned" badge from ids.
const assignedUsers = computed(() => roleAssignments.value.map((ra) => ({ id: ra.userId })))

// Open users dialog
function openUsersDialog() {
  showUsersDialog.value = true
}

// Inline editing functions
async function startEditName() {
  if (!canEdit.value) return
  editedName.value = role.value.name
  isEditingName.value = true
  await nextTick()
  nameInputRef.value?.focus()
}

function stopEditName() {
  if (editedName.value.trim()) {
    role.value = { ...role.value, name: editedName.value.trim() }
  }
  isEditingName.value = false
}

async function startEditDescription() {
  if (!canEdit.value) return
  editedDescription.value = role.value.description || ''
  isEditingDescription.value = true
  await nextTick()
  descriptionInputRef.value?.focus()
}

function stopEditDescription() {
  role.value = { ...role.value, description: editedDescription.value.trim() }
  isEditingDescription.value = false
}

const isInactive = computed(() => role.value?.statusId === 'INACTIVE')

// Persist a single field on the live instance (status / lock). These are
// standalone actions, independent of the name/description explicit-save flow.
// The DB lock trigger rejects business edits on a locked role (surfaced as an
// error toast); toggling `locked` itself is always allowed.
async function persistField(patch, successMsg) {
  const inst = liveRole.value
  if (!inst) return
  Object.assign(inst, patch)
  try {
    await inst.save()
    role.value = { ...role.value, ...patch }
    toast.success(successMsg)
  } catch (err) {
    toast.error(err?.message || 'Failed to update role')
  }
}

async function handleDeactivate() {
  if (
    !(await confirm({
      title: 'Deactivate role',
      message: `Are you sure you want to deactivate the role "${role.value.name}"?\n\nDeactivating a role will set its status to Inactive.`,
      okLabel: 'Deactivate',
      danger: true,
    }))
  )
    return
  await persistField({ statusId: 'INACTIVE' }, 'Role deactivated successfully')
}

async function handleActivate() {
  if (
    !(await confirm({
      title: 'Activate role',
      message: `Are you sure you want to activate the role "${role.value.name}"?`,
      okLabel: 'Activate',
    }))
  )
    return
  await persistField({ statusId: 'ACTIVE' }, 'Role activated successfully')
}

async function handleLock() {
  await persistField({ locked: true }, 'Role locked — it is now protected from edits')
}

async function handleUnlock() {
  await persistField({ locked: false }, 'Role unlocked')
}

// Save changes — apply the editable copy's name/description to the live db.Role
// instance and persist (syncEngine), then save the permission matrix via its own
// audited endpoint. Only touches the instance here, so discard stays clean.
async function saveChanges() {
  const inst = liveRole.value
  if (!inst) return

  loading.value = true
  try {
    inst.name = role.value.name
    inst.description = role.value.description ?? ''
    await inst.save()

    // Permission matrix (authz plane — unchanged action-RPC).
    await matrixRef.value?.save()

    savedMeta.value = { name: inst.name, description: inst.description ?? '' }
    role.value = { ...role.value, name: inst.name, description: inst.description }
    isEditingName.value = false
    isEditingDescription.value = false

    toast.success('Role updated successfully')
    goBack()
  } catch (err) {
    toast.error(err?.message || 'Failed to update role')
  } finally {
    loading.value = false
  }
}

// Cancel and go back
function goBack() {
  router.back()
}

// Warn before leaving with unsaved name/description or permission-matrix edits
// (M4 — the two are persisted by separate calls, so losing either is easy).
onBeforeRouteLeave(async () => {
  const dirty = metaDirty.value || matrixRef.value?.hasUnsavedChanges?.()
  if (!dirty) return true
  return await confirm({
    title: 'Discard unsaved changes?',
    message: 'This role has unsaved changes. Leave without saving them?',
    okLabel: 'Leave',
    danger: true,
  })
})

// (Data loads reactively via the liveRole / roleAssignments live queries above.)

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const roleActions = computed(() =>
  buildRoleActions(
    {
      canUpdate: canEdit.value,
      canLock: canUpdateRole.value,
      locked: isLocked.value,
      hasRole: !!role.value,
      isInactive: isInactive.value,
      saving: loading.value,
    },
    {
      save: saveChanges,
      cancel: goBack,
      activate: handleActivate,
      deactivate: handleDeactivate,
      lock: handleLock,
      unlock: handleUnlock,
    },
  ),
)
const roleDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbItems.value,
    actions: roleActions.value,
    sections: buildRoleSections(role.value),
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="roleDetailConfig"
    :record="role"
    :loading="initialLoading && !role"
    :notFound="notFound && !role"
    notFoundTitle="Role not found"
    notFoundDescription="This role could not be found."
  >
    <template #title>
      <BaseTextInput
        v-if="isEditingName"
        ref="nameInputRef"
        v-model="editedName"
        size="sm"
        @blur="stopEditName"
        @keyup.enter="stopEditName"
        @keyup.escape="stopEditName"
      />
      <div v-else class="tw:flex tw:items-center tw:gap-2">
        <BaseClickableRow
          class="tw:text-base tw:font-semibold tw:text-on-main"
          :class="canEdit ? 'tw:hover:text-primary' : ''"
          :disabled="!canEdit"
          aria-label="Edit role name"
          @click="canEdit && startEditName()"
        >
          {{ role?.name }}
        </BaseClickableRow>
        <span
          v-if="isLocked"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-full tw:bg-amber-100 tw:px-2 tw:py-0.5 tw:text-xs tw:font-semibold tw:text-amber-700"
          title="This role is locked — unlock it to make changes"
        >
          <IconLock :size="12" /> Locked
        </span>
      </div>
    </template>

    <template #status>
      <RoleStatusBadge v-if="role" :status="role.statusId" />
    </template>

    <template v-if="role" #meta>
      <button
        type="button"
        class="tw:inline-flex tw:items-center tw:gap-1.5 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:text-inherit tw:hover:text-primary"
        title="View access history"
        @click="showAudit = true"
      >
        <IconHistory :size="14" />
        Last Modified {{ role.updatedAt.formatDate('date') }}
      </button>
    </template>

    <template #actions>
      <DetailActionBar :actions="roleActions" :maxVisible="4" />
    </template>

    <template v-if="role" #rail>
      <!-- Description -->
      <BaseRailCard title="Description">
        <BaseTextarea
          v-if="isEditingDescription"
          ref="descriptionInputRef"
          v-model="editedDescription"
          rows="3"
          @blur="stopEditDescription"
          @keyup.escape="stopEditDescription"
        />
        <BaseClickableRow
          v-else
          class="tw:text-sm tw:text-secondary tw:leading-relaxed"
          :class="canEdit ? 'tw:hover:text-on-sidebar' : ''"
          :disabled="!canEdit"
          aria-label="Edit role description"
          @click="canEdit && startEditDescription()"
        >
          {{
            role.description ||
            (canEdit ? 'No description provided (click to edit)' : 'No description provided')
          }}
        </BaseClickableRow>
      </BaseRailCard>

      <!-- Assigned Users -->
      <BaseRailCard title="Assigned Users">
        <div class="tw:flex tw:items-center tw:gap-3">
          <div
            class="tw:w-10 tw:h-10 tw:rounded-full tw:bg-primary/10 tw:flex tw:items-center tw:justify-center tw:text-sm tw:font-bold tw:text-primary"
          >
            {{ usersCount }}
          </div>
          <button
            class="tw:text-sm tw:font-semibold tw:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:underline"
            @click="openUsersDialog"
          >
            View All Users
          </button>
        </div>
      </BaseRailCard>
    </template>

    <template v-if="role" #section-permissions>
      <!-- Permissions Section Header -->
      <div class="tw:flex tw:items-center tw:justify-between tw:mb-4">
        <h3 class="tw:text-section-title tw:font-semibold tw:text-on-sidebar">Permissions</h3>
        <div class="tw:flex tw:items-center tw:gap-4">
          <div class="tw:relative">
            <IconSearch
              :size="18"
              class="tw:absolute tw:left-3 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary tw:pointer-events-none"
            />
            <BaseTextInput
              v-model="permSearch"
              placeholder="Search modules..."
              class="tw:w-full tw:pl-9"
            />
          </div>
        </div>
      </div>

      <!-- Module × action × scope matrix -->
      <RolePermissionMatrix
        ref="matrixRef"
        :roleId="id"
        :canUpdate="canEdit"
        :search="permSearch"
      />
    </template>
  </BaseDetailLayout>

  <!-- Users Assignment Dialog -->
  <RoleUsersDialog
    v-if="showUsersDialog"
    v-model="showUsersDialog"
    :roleId="id"
    :roleName="role?.name"
    :assignedUsers="assignedUsers"
  />

  <!-- Access history (permission + membership changes) -->
  <RoleAuditDrawer v-model="showAudit" :roleId="id" />
</template>
