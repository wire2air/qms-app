<script setup>
import { IconMail, IconPlus, IconCamera, IconCrown } from '@tabler/icons-vue'
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers'
import { isAllowed } from '@/utils/currentSession.js'
import { uploadFile } from '@/utils/uploadService.js'
import { buildUserSections, buildUserActions } from './userDetailConfig.js'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const canUpdateUser = computed(() => isAllowed(['user_management:update']))

const user = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    return db.User.findByPk(id)
  },
  { models: ['User'] },
)

const loading = computed(() => user.value === undefined)

const showAvatarDialog = ref(false)
const showAuditLog = ref(false)
const uploadingAvatar = ref(false)
const sendingInvite = ref(false)
const showRoleSelect = ref(false)
const editingName = ref(false)

const { isSaving, saveError } = useAutoSave(user)

const roleAssignments = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [userId]) => {
    if (!userId) return []
    return db.RoleOnUser.where('userId', userId).exec()
  },

  { models: ['RoleOnUser'], initial: [] },
)

const assignedRoleIds = computed(() => roleAssignments.value.map((ra) => ra.roleId))

const addRoleOnUser = useLiveMutation(async (db, { userId, roleId }) => {
  const assignment = db.RoleOnUser.create({ userId, roleId })
  await assignment.save()
  return assignment
})

async function handleRolesChange(newRoleIds) {
  const currentIds = assignedRoleIds.value
  const toAdd = newRoleIds.filter((id) => !currentIds.includes(id))
  const toRemove = currentIds.filter((id) => !newRoleIds.includes(id))

  for (const roleId of toAdd) {
    await addRoleOnUser({ userId: props.id, roleId })
  }
  for (const roleId of toRemove) {
    const match = roleAssignments.value.find((ra) => ra.roleId === roleId)
    if (match) await match.delete()
  }
  showRoleSelect.value = false
}

const breadcrumbItems = computed(() => [
  { label: 'Users', to: getCompanyPath('/users') },
  { label: user.value ? `${user.value.firstName} ${user.value.lastName}` : 'Loading...' },
])

async function sendInvitation() {
  sendingInvite.value = true
  try {
    await post(`/v1/services/users/${props.id}/invite`, {})
    if (user.value) {
      user.value.inviteSent = true
    }
  } finally {
    sendingInvite.value = false
  }
}

function openAvatarDialog() {
  if (!canUpdateUser.value) return
  showAvatarDialog.value = true
}

async function handleAvatarSave({ file }) {
  uploadingAvatar.value = true
  try {
    const asset = await uploadFile(file, 'USERAVATAR')
    user.value.avatar = asset.url
    await user.value.save()
    showAvatarDialog.value = false
  } finally {
    uploadingAvatar.value = false
  }
}

async function handleAvatarDelete() {
  uploadingAvatar.value = true
  try {
    user.value.avatar = null
    await user.value.save()
    showAvatarDialog.value = false
  } finally {
    uploadingAvatar.value = false
  }
}

// ─── BaseDetailLayout config ──────────────────────────────────────────────────
const userActions = computed(() =>
  buildUserActions(
    {
      canUpdate: canUpdateUser.value,
      hasUser: !!user.value,
      inviteSent: user.value?.inviteSent,
      sendingInvite: sendingInvite.value,
    },
    {
      sendInvite: sendInvitation,
      openAuditLog() {
        showAuditLog.value = true
      },
    },
  ),
)
const userDetailConfig = computed(() =>
  defineDetailConfig({
    variant: 'standard',
    width: 'standard',
    breadcrumbs: breadcrumbItems.value,
    actions: userActions.value,
    sections: buildUserSections(user.value),
  }),
)
</script>

<template>
  <BaseDetailLayout
    :config="userDetailConfig"
    :record="user"
    :loading="loading"
    :notFound="!loading && !user"
    notFoundTitle="User not found"
    notFoundDescription="This user could not be found."
  >
    <template #title>
      <div v-if="editingName && canUpdateUser" class="tw:flex tw:gap-2">
        <BaseTextInput
          v-model="user.firstName"
          placeholder="First Name"
          size="sm"
          autofocus
          @keyup.enter="editingName = false"
          @blur="editingName = false"
        />
        <BaseTextInput
          v-model="user.lastName"
          placeholder="Last Name"
          size="sm"
          @keyup.enter="editingName = false"
          @blur="editingName = false"
        />
      </div>
      <div v-else class="tw:flex tw:items-center tw:gap-2">
        <BaseClickableRow
          class="tw:text-base tw:font-semibold tw:text-on-main"
          :class="canUpdateUser ? 'tw:hover:text-primary' : ''"
          :disabled="!canUpdateUser"
          aria-label="Edit user name"
          @click="canUpdateUser && (editingName = true)"
        >
          {{ user?.firstName }} {{ user?.lastName }}
        </BaseClickableRow>
        <!-- Owner standing bypasses all roles/permissions (L3) — make it visible
             so an "owner has everything" isn't mistaken for granted access. -->
        <span
          v-if="user?.isOwner"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded-full tw:bg-amber-100 tw:px-2 tw:py-0.5 tw:text-xs tw:font-semibold tw:text-amber-700"
          title="Company owner — full access, bypasses roles and permissions"
        >
          <IconCrown :size="12" /> Owner
        </span>
      </div>
    </template>

    <template #status>
      <UserStatusBadgeById v-if="user" :statusId="user.userStatusId" />
    </template>

    <template v-if="user" #meta>
      <span class="tw:inline-flex tw:items-center tw:gap-1.5">
        <IconMail :size="14" />
        {{ user.email }}
      </span>
    </template>

    <template #actions>
      <div class="tw:flex tw:items-center tw:gap-2">
        <div v-if="isSaving" class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary">
          <BaseSpinner size="xs" />
          Saving...
        </div>
        <p v-else-if="saveError" class="tw:text-sm tw:text-red-500">{{ saveError }}</p>
        <DetailActionBar :actions="userActions" />
      </div>
    </template>

    <template v-if="user" #section-details>
      <!-- Personal Information -->
      <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
        <div class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover">
          <BaseText as="h3" weight="bold">Personal Information</BaseText>
        </div>
        <div class="tw:p-6 tw:space-y-6">
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-4">
            <!-- Email -->
            <BaseDetailField label="Email Address" :value="user?.email" />

            <!-- Language -->
            <div>
              <p class="tw:text-secondary tw:mb-1">Preferred Language</p>
              <LanguageSelectMenu v-if="canUpdateUser" v-model="user.languageId" :required="true" />
              <LanguageBadge v-else :languageId="user?.languageId" />
            </div>

            <!-- Timezone -->
            <div>
              <TimezoneDropdown v-model="user.timeZone" />
            </div>

            <!-- User Status -->
            <div>
              <p class="tw:text-secondary tw:mb-1">Status</p>
              <UserStatusSelectMenu
                v-if="canUpdateUser"
                v-model="user.userStatusId"
                :required="true"
              />
              <UserStatusBadgeById v-else :statusId="user?.userStatusId" />
            </div>

            <!-- Site -->
            <div>
              <p class="tw:text-secondary tw:mb-1">Site</p>
              <SiteSelectMenu v-if="canUpdateUser" v-model="user.siteId" :required="true" />
              <template v-else>
                <SiteBadgeById v-if="user?.siteId" :siteId="user.siteId" />
                <span v-else class="tw:text-sm tw:text-secondary">—</span>
              </template>
            </div>

            <!-- Department -->
            <div>
              <p class="tw:text-secondary tw:mb-1">Department</p>
              <DepartmentSelectMenu
                v-if="canUpdateUser"
                v-model="user.departmentId"
                :siteId="user.siteId"
                :required="true"
              />
              <template v-else>
                <DepartmentBadgeById v-if="user?.departmentId" :departmentId="user.departmentId" />
                <span v-else class="tw:text-sm tw:text-secondary">—</span>
              </template>
            </div>
          </div>

          <!-- Color -->
          <div class="tw:pt-4 tw:border-t tw:border-divider">
            <p class="tw:text-secondary tw:mb-3">User Color</p>
            <div class="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:bg-main-hover tw:rounded-lg">
              <BaseColorPicker v-if="canUpdateUser" v-model="user.color" />
              <div
                v-else
                class="tw:size-10 tw:rounded tw:shrink-0"
                :style="{ backgroundColor: user?.color || '#2563eb' }"
              ></div>
              <div>
                <p class="tw:text-sm tw:font-bold tw:text-on-main">{{ user?.color || '#2563eb' }}</p>
                <p class="tw:text-xs tw:text-secondary">Used for avatar and identification</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-if="user" #rail>
      <!-- Overview: avatar + lifecycle dates -->
      <BaseRailCard title="Overview">
        <div class="tw:flex tw:flex-col tw:gap-4">
          <div class="tw:flex tw:justify-center">
            <BaseClickableRow
              class="tw:relative tw:group"
              :disabled="!canUpdateUser"
              aria-label="Change profile picture"
              @click="openAvatarDialog"
            >
              <UserAvatar :user="user" :showBadge="true" class="tw:size-24" />
              <div
                v-if="canUpdateUser"
                class="tw:absolute tw:inset-0 tw:bg-black/50 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:pointer-events-none"
              >
                <IconCamera :size="32" class="tw:text-white" />
              </div>
            </BaseClickableRow>
          </div>
          <BaseDetailField
            label="Account Created"
            layout="inline"
            :value="user.createdAt?.formatDate('date')"
          />
          <BaseDetailField
            label="Last Updated"
            layout="inline"
            :value="user.updatedAt?.formatDate('date')"
          />
        </div>
      </BaseRailCard>

      <!-- Role Assignments -->
      <BaseRailCard title="Role Assignments">
        <div class="tw:flex tw:flex-col tw:gap-3">
          <div v-if="canUpdateUser" class="tw:flex tw:justify-end">
            <RoleSelectMenu
              :modelValue="assignedRoleIds"
              :required="false"
              multiple
              @update:modelValue="handleRolesChange"
            >
              <template #button>
                <BaseButton iconOnly size="sm"><IconPlus :size="18" /></BaseButton>
              </template>
            </RoleSelectMenu>
          </div>
          <template v-if="assignedRoleIds.length > 0">
            <div class="tw:flex tw:flex-col tw:gap-2">
              <UserRoleListItemById
                v-for="roleId in assignedRoleIds"
                :key="roleId"
                :roleId="roleId"
                :clearable="canUpdateUser"
                @clear="handleRolesChange(assignedRoleIds.filter((id) => id !== roleId))"
              />
            </div>
          </template>
          <div v-else class="tw:text-center tw:py-4">
            <p class="tw:text-sm tw:text-secondary">No roles assigned yet</p>
          </div>
        </div>
      </BaseRailCard>

      <!-- Effective access — the real "why does this user have X" view, replacing
           the former hardcoded Permission Note. -->
      <BaseRailCard title="Effective Access">
        <UserEffectivePermissions :userId="props.id" />
      </BaseRailCard>
    </template>
  </BaseDetailLayout>

  <!-- Avatar Management Dialog -->
  <ImageCropDialog
    v-model="showAvatarDialog"
    :currentImageUrl="user?.avatar"
    title="Profile Picture"
    :aspectRatio="1"
    @save="handleAvatarSave"
    @delete="handleAvatarDelete"
  />

  <!-- Audit Log Dialog — shows actions performed BY this user -->
  <AuditLogDialog
    v-model="showAuditLog"
    :performedBy="props.id"
    :title="`Audit Log — ${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Audit Log'"
  />
</template>
