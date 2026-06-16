<script setup>
import { IconCamera, IconBuilding, IconUserPlus, IconCopy } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers'
import { isAllowed } from '@/utils/currentSession'
import { uploadFile } from '@/utils/uploadService.js'

const props = defineProps({
  id: {
    type: String,
    required: true,
  },
})

const canUpdate = computed(() => isAllowed(['teams:update']))

// ─── Live queries ─────────────────────────────────────────────────────────────

const group = useLiveQueryWithDeps([() => props.id], async (db, [id]) => db.Team.findByPk(id), {
  models: ['Team'],
})
const users = useLiveQuery(
  async (db) => (await db.User.where().exec()).filter((u) => u.userStatusId === 'ACTIVE'),

  { models: ['User'], initial: [] },
)
const userMapById = computed(() => {
  const map = new Map()
  users.value.forEach((u) => map.set(u.id, u))
  return map
})

const memberships = useLiveQueryWithDeps(
  [() => props.id, userMapById],
  async (db, [id, userMap]) => {
    const records = await db.UserOnTeam.where('teamId', id).exec()
    const resolved = await Promise.all(
      records.map(async (m) => ({ m, user: userMap.get(m.userId) })),
    )
    return resolved.filter((e) => e.user)
  },

  { models: ['UserOnTeam'], initial: [] },
)

const loading = computed(() => group.value === undefined)
const memberCount = computed(() => memberships.value.length)
const userIdsOnTeam = computed(() => memberships.value.map((e) => e.user.id))
const membershipMapById = computed(() => {
  const map = new Map()
  memberships.value.forEach((e) => map.set(e.user.id, e))
  return map
})
const filteredUsers = computed(() => {
  return users.value
    .filter((u) => !userIdsOnTeam.value.includes(u.id))
    .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }))
})

// ─── Breadcrumbs ──────────────────────────────────────────────────────────────

const breadcrumbItems = computed(() => [
  { label: 'Groups', to: getCompanyPath('/groups') },
  { label: group.value?.name || 'Loading...' },
])

// ─── Auto-save ────────────────────────────────────────────────────────────────

const editingName = ref(false)
const { isSaving, saveError } = useAutoSave(group)

// ─── Avatar ───────────────────────────────────────────────────────────────────

const showAvatarDialog = ref(false)
const uploadingAvatar = ref(false)

function openAvatarDialog() {
  if (!canUpdate.value) return
  showAvatarDialog.value = true
}

async function handleAvatarSave({ file }) {
  uploadingAvatar.value = true
  try {
    const asset = await uploadFile(file, 'TEAMAVATAR')
    group.value.avatar = asset.url
    await group.value.save()
    showAvatarDialog.value = false
  } finally {
    uploadingAvatar.value = false
  }
}

async function handleAvatarDelete() {
  uploadingAvatar.value = true
  try {
    group.value.avatar = null
    await group.value.save()
    showAvatarDialog.value = false
  } finally {
    uploadingAvatar.value = false
  }
}

// ─── Members ──────────────────────────────────────────────────────────────────

const addMember = useLiveMutation(async (db, userId) => {
  const existing = await db.UserOnTeam.where('teamId', props.id, { force: true })
    .where('userId', userId)
    .first()
  if (existing) {
    await existing.restore()
  } else {
    const m = db.UserOnTeam.create({ teamId: props.id, userId })
    await m.save()
  }
})

async function onAddMembers(userIds) {
  const toAdd = userIds.filter((id) => !userIdsOnTeam.value.includes(id))
  const toRemove = userIdsOnTeam.value.filter((id) => !userIds.includes(id))

  await Promise.all(toAdd.map((userId) => addMember(userId)))
  await Promise.all(toRemove.map((userId) => membershipMapById.value.get(userId)?.m.delete()))
}

async function onRemoveMember(entry) {
  await entry.m.delete()
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

function copyToClipboard(text) {
  navigator.clipboard.writeText(text)
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs :items="breadcrumbItems" />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <div class="tw:flex tw:items-center tw:gap-2">
        <div
          v-if="isSaving"
          class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary"
        >
          <BaseSpinner size="xs" />
          Saving...
        </div>
      </div>
    </SafeTeleport>

    <!-- Loading State -->
    <div
      v-if="loading"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:flex-1 tw:py-8"
    >
      <BaseSpinner size="lg" />
      <div class="tw:text-sm tw:text-secondary tw:mt-3">Loading team...</div>
    </div>

    <!-- Content -->
    <div v-else-if="group" class="tw:overflow-y-auto">
      <div class="tw:max-w-5xl tw:mx-auto tw:p-8 tw:space-y-8">
        <!-- Error Banner -->
        <div
          v-if="saveError"
          class="tw:p-3 tw:bg-red-50 tw:text-red-600 tw:text-sm tw:rounded-lg tw:border tw:border-red-200"
        >
          {{ saveError }}
        </div>

        <!-- Profile Header -->
        <div class="tw:bg-sidebar tw:border tw:border-divider tw:p-6 tw:rounded-xl tw:shadow-sm">
          <div
            class="tw:flex tw:flex-col tw:md:flex-row tw:items-start tw:md:items-center tw:justify-between tw:gap-6"
          >
            <div class="tw:flex tw:items-center tw:gap-6">
              <!-- Avatar -->
              <BaseClickableRow
                class="tw:relative tw:group"
                :disabled="!canUpdate"
                aria-label="Change group avatar"
                @click="openAvatarDialog"
              >
                <TeamAvatar :team="group" class="tw:size-20" />
                <div
                  v-if="canUpdate"
                  class="tw:absolute tw:inset-0 tw:bg-black/50 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:pointer-events-none"
                >
                  <IconCamera :size="28" class="tw:text-white" />
                </div>
              </BaseClickableRow>

              <!-- Name & Leadership -->
              <div>
                <div class="tw:flex tw:items-center tw:gap-3 tw:mb-1">
                  <template v-if="editingName && canUpdate">
                    <BaseTextInput
                      v-model="group.name"
                      placeholder="Group name"
                      size="sm"
                      @keyup.enter="editingName = false"
                      @blur="editingName = false"
                    />
                  </template>
                  <h2
                    v-else
                    class="tw:text-2xl tw:font-bold tw:text-on-main"
                    :class="{ 'tw:cursor-pointer tw:hover:text-primary': canUpdate }"
                    @click="canUpdate && (editingName = true)"
                  >
                    {{ group.name || 'Team' }}
                  </h2>
                  <span
                    v-if="group.isLeadership"
                    class="tw:text-xs tw:font-semibold tw:bg-primary/10 tw:text-primary tw:px-2.5 tw:py-1 tw:rounded-full"
                  >
                    Leadership
                  </span>
                </div>
                <p class="tw:text-secondary tw:flex tw:items-center tw:gap-1.5 tw:text-sm">
                  <IconBuilding :size="14" />
                  {{ memberCount }} member{{ memberCount !== 1 ? 's' : '' }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-3 tw:gap-8">
          <!-- Team Overview Card -->
          <div class="tw:lg:col-span-1 tw:space-y-6">
            <div
              class="tw:bg-sidebar tw:border tw:border-divider tw:rounded-xl tw:shadow-sm tw:overflow-hidden"
            >
              <div class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover">
                <h3 class="tw:font-bold tw:text-on-main tw:text-sm tw:uppercase tw:tracking-wide">
                  Team Settings
                </h3>
              </div>
              <div class="tw:p-6 tw:space-y-5">
                <!-- Team ID -->
                <div>
                  <label class="tw:text-xs tw:text-secondary tw:block tw:mb-1">Team ID</label>
                  <div class="tw:flex tw:items-center tw:gap-2 tw:group">
                    <code
                      class="tw:text-xs tw:text-on-main tw:bg-main tw:font-mono tw:break-all tw:p-1 tw:rounded tw:flex-1"
                    >
                      {{ id }}
                    </code>
                    <button
                      class="tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:p-1 tw:rounded tw:hover:bg-main-hover"
                      @click="copyToClipboard(id)"
                    >
                      <IconCopy :size="14" class="tw:text-secondary" />
                    </button>
                  </div>
                </div>

                <!-- Color -->
                <div v-if="canUpdate">
                  <label class="tw:text-xs tw:text-secondary tw:block tw:mb-1">Group Color</label>
                  <BaseColorPicker v-model="group.color" />
                </div>
                <div v-else>
                  <label class="tw:text-xs tw:text-secondary tw:block tw:mb-1">Group Color</label>
                  <span
                    class="tw:inline-block tw:size-6 tw:rounded-full tw:border tw:border-divider"
                    :style="{ backgroundColor: group.color }"
                  />
                </div>

                <!-- Leadership Toggle -->
                <div>
                  <label class="tw:text-xs tw:text-secondary tw:block tw:mb-1">Type</label>
                  <label
                    v-if="canUpdate"
                    class="tw:flex tw:items-center tw:gap-2 tw:cursor-pointer"
                  >
                    <BaseSwitch v-model="group.isLeadership" />
                    <span class="tw:text-sm tw:text-on-main">Leadership Team</span>
                  </label>
                  <span v-else-if="group.isLeadership" class="tw:text-sm tw:text-on-main">
                    Leadership Team
                  </span>
                  <span v-else class="tw:text-sm tw:text-secondary">Standard Team</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Members Section -->
          <div class="tw:lg:col-span-2 tw:space-y-6">
            <div class="tw:bg-sidebar tw:border tw:border-divider tw:rounded-xl tw:shadow-sm">
              <div
                class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:flex tw:items-center tw:justify-between tw:bg-main-hover"
              >
                <div class="tw:flex tw:items-center tw:gap-2">
                  <h3 class="tw:font-bold tw:text-on-main tw:text-sm tw:uppercase tw:tracking-wide">
                    Members
                  </h3>
                  <span
                    class="tw:text-[10px] tw:font-bold tw:bg-main tw:border tw:border-divider tw:px-2 tw:py-0.5 tw:rounded-full tw:text-secondary"
                  >
                    {{ memberCount }}
                  </span>
                </div>
                <BaseSelectMenu
                  :modelValue="userIdsOnTeam"
                  :items="filteredUsers"
                  :required="true"
                  :multiple="true"
                  @update:modelValue="onAddMembers"
                >
                  <template #button="scope">
                    <slot name="button" v-bind="scope">
                      <button
                        class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
                      >
                        <IconUserPlus :size="14" />
                        Add Members
                      </button>
                    </slot>
                  </template>
                </BaseSelectMenu>
              </div>

              <!-- Member List -->
              <div v-if="memberships.length > 0" class="tw:divide-y tw:divide-divider">
                <div
                  v-for="entry in memberships"
                  :key="entry.m.id"
                  class="tw:flex tw:items-center tw:p-4 tw:hover:bg-main-hover tw:transition-colors"
                >
                  <UsersListItem
                    class="tw:w-full"
                    :user="entry.user"
                    :clearable="canUpdate"
                    @clear="onRemoveMember(entry)"
                  />
                </div>
              </div>

              <div
                v-else
                class="tw:p-8 tw:text-center tw:text-secondary tw:text-sm tw:border-dashed tw:border-2 tw:border-divider tw:rounded-b-xl"
              >
                No members assigned yet.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Avatar Management Dialog -->
    <ImageCropDialog
      v-model="showAvatarDialog"
      :currentImageUrl="group?.avatar"
      title="Team Avatar"
      :aspectRatio="1"
      @save="handleAvatarSave"
      @delete="handleAvatarDelete"
    />
  </div>
</template>
