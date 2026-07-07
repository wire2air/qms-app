<script setup>
// Personal profile — the signed-in user's own name, avatar, color, and
// preferences (language, timezone, appearance). All fields are SyncEngine-
// modeled: inline edit + autosave. Rendered as a tab on pages/profile.vue.
import ThemeToggle from '@/components/layout/ThemeToggle.vue'
import { currentSession } from '@/utils/currentSession.js'
import { uploadFile } from '@/utils/uploadService.js'
import {
  IconUserCircle,
  IconAdjustments,
  IconCamera,
  IconMail,
  IconPalette,
} from '@tabler/icons-vue'

defineOptions({ name: 'PersonalProfile' })

const toast = useToast()

// The signed-in user's own record — always editable (it's your account).
const user = useLiveQueryWithDeps(
  [() => currentSession.value?.userId],
  async (db, [userId]) => (userId ? db.User.findByPk(userId) : null),
  { models: ['User'] },
)

const loading = computed(() => user.value === undefined)

const { isSaving, saveError } = useAutoSave(user)

// ── Avatar ────────────────────────────────────────────────────────────────
const showAvatarDialog = ref(false)
const uploadingAvatar = ref(false)

async function handleAvatarSave({ file }) {
  uploadingAvatar.value = true
  try {
    const asset = await uploadFile(file, 'USERAVATAR')
    user.value.avatar = asset.url
    await user.value.save()
    showAvatarDialog.value = false
    toast.success('Profile picture updated')
  } catch (err) {
    toast.error(err?.message || 'Could not update your picture')
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
  } catch (err) {
    toast.error(err?.message || 'Could not remove your picture')
  } finally {
    uploadingAvatar.value = false
  }
}
</script>

<template>
  <!-- Loading -->
  <div v-if="loading" class="tw:flex tw:items-center tw:gap-2 tw:py-10">
    <BaseSpinner size="sm" />
    <span class="tw:text-sm tw:text-secondary">Loading your profile…</span>
  </div>

  <div v-else-if="user" class="tw:flex tw:flex-col tw:gap-6">
    <div class="tw:flex tw:justify-end tw:min-h-4">
      <div v-if="isSaving" class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary">
        <BaseSpinner size="xs" />
        Saving…
      </div>
      <p v-else-if="saveError" class="tw:text-sm tw:text-red-500">{{ saveError }}</p>
    </div>

    <!-- ── Profile ─────────────────────────────────────────────────────── -->
    <PageSection title="Profile" :icon="IconUserCircle">
      <BaseCard>
        <div class="tw:flex tw:flex-col tw:gap-6 tw:sm:flex-row tw:sm:items-start">
          <!-- Avatar -->
          <div class="tw:flex tw:flex-col tw:items-center tw:gap-2 tw:shrink-0">
            <BaseClickableRow
              class="tw:relative tw:group"
              aria-label="Change profile picture"
              @click="showAvatarDialog = true"
            >
              <UserAvatar :user="user" class="tw:size-24" />
              <div
                class="tw:absolute tw:inset-0 tw:bg-black/50 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:pointer-events-none"
              >
                <IconCamera :size="28" class="tw:text-white" />
              </div>
            </BaseClickableRow>
            <button
              class="tw:text-xs tw:text-primary tw:hover:underline"
              @click="showAvatarDialog = true"
            >
              Change photo
            </button>
          </div>

          <!-- Fields -->
          <div class="tw:flex tw:flex-1 tw:flex-col tw:gap-4 tw:w-full">
            <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-4">
              <BaseTextInput v-model="user.firstName" label="First name" placeholder="First name" />
              <BaseTextInput v-model="user.lastName" label="Last name" placeholder="Last name" />
            </div>

            <BaseTextInput v-model="user.jobTitle" label="Job title" placeholder="e.g. Quality Manager" />

            <!-- Email — read-only (it's the login identifier) -->
            <div>
              <p class="tw:text-secondary tw:mb-1 tw:text-sm">Email address</p>
              <div
                class="tw:flex tw:items-center tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover tw:px-3 tw:py-2"
              >
                <IconMail :size="16" class="tw:text-secondary" />
                <span class="tw:text-sm tw:text-on-main">{{ user.email }}</span>
              </div>
              <p class="tw:text-caption tw:text-secondary tw:mt-1">
                Contact an administrator to change the email you sign in with.
              </p>
            </div>

            <!-- Color -->
            <div>
              <p class="tw:text-secondary tw:mb-2 tw:text-sm">Your color</p>
              <div class="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:bg-main-hover tw:rounded-lg">
                <BaseColorPicker v-model="user.color" />
                <div>
                  <p class="tw:text-sm tw:font-bold tw:text-on-main">{{ user.color || '#2563eb' }}</p>
                  <p class="tw:text-xs tw:text-secondary">Used for your avatar and identification</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </BaseCard>
    </PageSection>

    <!-- ── Preferences ─────────────────────────────────────────────────── -->
    <PageSection title="Preferences" :icon="IconAdjustments">
      <BaseCard>
        <div class="tw:flex tw:flex-col tw:gap-6">
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-4">
            <div>
              <p class="tw:text-secondary tw:mb-1 tw:text-sm">Preferred language</p>
              <LanguageSelectMenu v-model="user.languageId" :required="true" />
            </div>
            <div>
              <p class="tw:text-secondary tw:mb-1 tw:text-sm">Timezone</p>
              <TimezoneDropdown v-model="user.timeZone" />
            </div>
          </div>

          <div class="tw:flex tw:items-center tw:justify-between tw:border-t tw:border-divider tw:pt-4">
            <div class="tw:flex tw:items-center tw:gap-2">
              <IconPalette :size="18" class="tw:text-secondary" />
              <div>
                <p class="tw:text-sm tw:font-medium tw:text-on-main">Appearance</p>
                <p class="tw:text-caption tw:text-secondary">Switch between light and dark themes</p>
              </div>
            </div>
            <ThemeToggle :size="20" />
          </div>
        </div>
      </BaseCard>
    </PageSection>

    <!-- Avatar crop dialog -->
    <ImageCropDialog
      v-model="showAvatarDialog"
      :currentImageUrl="user?.avatar"
      title="Profile Picture"
      :aspectRatio="1"
      @save="handleAvatarSave"
      @delete="handleAvatarDelete"
    />
  </div>
</template>
