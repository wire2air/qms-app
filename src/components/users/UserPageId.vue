<script setup>
import { IconMail, IconInfoCircle, IconPlus, IconCamera, IconHistory } from '@tabler/icons-vue'
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers'
import { isAllowed } from '@/utils/currentSession.js'
import { uploadFile } from '@/utils/uploadService.js'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const canUpdateUser = computed(() => isAllowed(['users:update']))

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
</script>

<template>
  <BasePage width="standard" fullHeight>
    <PageHeader>
      <template #title>
        <BaseBreadcrumbs :items="breadcrumbItems" />
      </template>
      <template #actions>
        <BaseButton
          v-if="canUpdateUser && user && !user.inviteSent"
          variant="outline"
          :loading="sendingInvite"
          @click="sendInvitation"
        >
          Send Invitation
        </BaseButton>
      </template>
    </PageHeader>

    <!-- Loading State -->
    <div
      v-if="loading"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:flex-1 tw:py-8"
    >
      <BaseSpinner size="lg" />
      <div class="tw:text-sm tw:text-secondary tw:mt-3">Loading user...</div>
    </div>

    <!-- Content -->
    <div v-else class="tw:flex-1 tw:min-h-0 tw:overflow-y-auto tw:py-8">
      <div class="tw:space-y-6">
        <!-- Saving Indicator -->
        <div v-if="isSaving" class="tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-secondary">
          <BaseSpinner size="xs" />
          Saving...
        </div>

        <!-- Save Error -->
        <div v-if="saveError" class="tw:p-3 tw:bg-red-50 tw:text-red-600 tw:text-sm tw:rounded-lg">
          {{ saveError }}
        </div>

        <!-- Profile Header Card -->
        <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:p-8">
          <div
            class="tw:flex tw:flex-col tw:md:flex-row tw:items-center tw:md:items-start tw:gap-6"
          >
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
            <div
              class="tw:flex tw:flex-col tw:items-center tw:md:items-start tw:text-center tw:md:text-left tw:pt-2"
            >
              <div class="tw:flex tw:items-center tw:gap-3 tw:mb-1 tw:flex-wrap">
                <!-- Edit mode -->
                <template v-if="editingName && canUpdateUser">
                  <BaseTextInput
                    v-model="user.firstName"
                    placeholder="First Name"
                    size="sm"
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
                </template>
                <!-- Display mode -->
                <h2
                  v-else
                  class="tw:text-3xl tw:font-bold tw:text-on-sidebar"
                  :class="{ 'tw:cursor-pointer tw:hover:text-primary': canUpdateUser }"
                  @click="canUpdateUser && (editingName = true)"
                >
                  {{ user?.firstName }} {{ user?.lastName }}
                </h2>
                <UserStatusBadgeById :statusId="user?.userStatusId" />
              </div>
              <div class="tw:flex tw:flex-wrap tw:gap-1 tw:mb-4">
                <RoleBadgeById v-for="roleId in assignedRoleIds" :key="roleId" :roleId="roleId" />
                <span v-if="!assignedRoleIds.length" class="tw:text-lg tw:text-secondary">
                  No roles assigned
                </span>
              </div>
              <div class="tw:flex tw:flex-wrap tw:justify-center tw:md:justify-start tw:gap-4">
                <div class="tw:flex tw:items-center tw:gap-2 tw:text-secondary tw:text-sm">
                  <IconMail :size="18" />
                  {{ user?.email }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Two Column Layout -->
        <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-2 tw:gap-6">
          <!-- Left Column: Personal Information -->
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
                  <LanguageSelectMenu
                    v-if="canUpdateUser"
                    v-model="user.languageId"
                    :required="true"
                  />
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
                    <DepartmentBadgeById
                      v-if="user?.departmentId"
                      :departmentId="user.departmentId"
                    />
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
                    <p class="tw:text-sm tw:font-bold tw:text-on-main">
                      {{ user?.color || '#2563eb' }}
                    </p>
                    <p class="tw:text-xs tw:text-secondary">Used for avatar and identification</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column: Role Assignments -->
          <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
            <div
              class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:justify-between tw:items-center"
            >
              <BaseText as="h3" weight="bold">Role Assignments</BaseText>
              <div v-if="canUpdateUser">
                <RoleSelectMenu
                  :modelValue="assignedRoleIds"
                  :required="false"
                  multiple
                  @update:modelValue="handleRolesChange"
                >
                  <template #button>
                    <BaseButton v-if="canUpdateUser" iconOnly size="sm">
                      <IconPlus :size="18" />
                    </BaseButton>
                  </template>
                </RoleSelectMenu>
              </div>
            </div>
            <div class="tw:p-6 tw:space-y-4">
              <!-- Role badges -->
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
                <div class="tw:bg-primary/5 tw:rounded-lg tw:p-4 tw:mt-2">
                  <div
                    class="tw:flex tw:items-center tw:gap-2 tw:text-primary tw:text-xs tw:font-bold tw:mb-1"
                  >
                    <IconInfoCircle :size="14" />
                    Permission Note
                  </div>
                  <p class="tw:text-xs tw:text-secondary">
                    User currently has limited access to administrative configurations but full
                    access to workflows.
                  </p>
                </div>
              </template>
              <div v-else class="tw:text-center tw:py-8">
                <p class="tw:text-sm tw:text-secondary">No roles assigned yet</p>
              </div>
            </div>
          </div>
        </div>

        <!-- System Metadata Footer -->
        <div
          class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:p-6 tw:flex tw:flex-col tw:md:flex-row tw:justify-between tw:items-center tw:gap-4"
        >
          <div class="tw:flex tw:items-center tw:gap-6">
            <div class="tw:flex tw:flex-col">
              <span class="tw:text-secondary tw:text-xs">Account Created</span>
              <span class="tw:text-sm tw:font-medium tw:text-on-sidebar">
                {{ user?.createdAt?.formatDate('date') }}
              </span>
            </div>
            <div class="tw:w-px tw:h-8 tw:bg-divider tw:hidden tw:md:block"></div>
            <div class="tw:flex tw:flex-col">
              <span class="tw:text-secondary tw:text-xs">Last Updated</span>
              <span class="tw:text-sm tw:font-medium tw:text-on-sidebar">
                {{ user?.updatedAt?.formatDate('date') }}
              </span>
            </div>
          </div>
          <button
            class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-1.5 tw:bg-main-hover tw:rounded-full tw:text-secondary tw:cursor-pointer tw:hover:bg-divider tw:transition-colors"
            @click="showAuditLog = true"
          >
            <IconHistory :size="14" />
            <span class="tw:text-xs tw:font-medium">View Audit Logs</span>
          </button>
        </div>
      </div>
    </div>

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
  </BasePage>
</template>
