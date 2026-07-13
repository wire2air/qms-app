<script setup>
// Personal profile — the signed-in user's own name, avatar, color, and
// preferences (language, timezone, appearance). All fields are SyncEngine-
// modeled: inline edit + autosave. Rendered as a tab on pages/profile.vue.
//
// Layout: an identity hero (avatar + name + role/email) sits above two grouped
// cards — Profile details and Preferences — matching the sibling Security tab's
// rhythm (each tab opens with a hero card, then gap-6 PageSection + BaseCard).
import ThemeToggle from '@/components/layout/ThemeToggle.vue'
import { currentSession } from '@/utils/currentSession.js'
import { uploadFile } from '@/utils/uploadService.js'
import {
  IconUserCircle,
  IconAdjustments,
  IconCamera,
  IconMail,
  IconLock,
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

// Identity display for the hero (read-only reflection of the fields below).
const fullName = computed(() => {
  const name = `${user.value?.firstName || ''} ${user.value?.lastName || ''}`.trim()
  return name || 'Your name'
})
const identityLine = computed(() => {
  const parts = []
  if (user.value?.jobTitle) parts.push(user.value.jobTitle)
  if (user.value?.email) parts.push(user.value.email)
  return parts.join('  ·  ')
})

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
    <!-- Autosave status — only rendered while active, so no empty reserved strip -->
    <div v-if="isSaving || saveError" class="tw:flex tw:justify-end">
      <div v-if="isSaving" class="tw:flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary">
        <BaseSpinner size="xs" />
        Saving…
      </div>
      <p v-else class="tw:text-sm tw:text-red-500">{{ saveError }}</p>
    </div>

    <!-- ── Identity hero ─────────────────────────────────────────────────── -->
    <BaseCard padding="lg">
      <div class="tw:flex tw:flex-col tw:items-center tw:gap-5 tw:text-center tw:sm:flex-row tw:sm:items-center tw:sm:text-left">
        <BaseClickableRow
          class="tw:relative tw:group tw:shrink-0 tw:rounded-full"
          aria-label="Change profile picture"
          @click="showAvatarDialog = true"
        >
          <UserAvatar :user="user" class="tw:size-20" />
          <div
            class="tw:absolute tw:inset-0 tw:flex tw:items-center tw:justify-center tw:rounded-full tw:bg-black/50 tw:opacity-0 tw:transition-opacity tw:pointer-events-none tw:group-hover:opacity-100"
          >
            <IconCamera :size="24" class="tw:text-white" />
          </div>
        </BaseClickableRow>

        <div class="tw:min-w-0 tw:flex-1">
          <BaseHeading :level="2" as="page-title" truncate>{{ fullName }}</BaseHeading>
          <p class="tw:mt-0.5 tw:text-sm tw:text-secondary tw:truncate">{{ identityLine }}</p>
        </div>

        <BaseButton variant="outline" size="sm" class="tw:shrink-0" @click="showAvatarDialog = true">
          <IconCamera :size="16" /> Change photo
        </BaseButton>
      </div>
    </BaseCard>

    <!-- ── Profile details ───────────────────────────────────────────────── -->
    <PageSection title="Profile" :icon="IconUserCircle">
      <BaseCard>
        <div class="tw:flex tw:flex-col tw:gap-5">
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-4">
            <BaseTextInput
              v-model="user.firstName"
              label="First name"
              placeholder="First name"
              size="md"
            />
            <BaseTextInput
              v-model="user.lastName"
              label="Last name"
              placeholder="Last name"
              size="md"
            />
          </div>

          <div>
            <p class="tw:text-label tw:font-medium tw:text-on-main tw:mb-1.5">Employee title</p>
            <!-- Internal staff pick from the company employee-title lookup;
                 supplier users keep free text. jobTitle mirrors the name. -->
            <EmployeeTitleSelectMenu
              v-if="user.kind !== 'EXTERNAL_SUPPLIER'"
              v-model="user.employeeTitleId"
              @update:name="(n) => (user.jobTitle = n || null)"
            />
            <BaseTextInput
              v-else
              v-model="user.jobTitle"
              placeholder="e.g. Quality Manager"
              size="md"
            />
          </div>

          <!-- Email — read-only (it's the login identifier) -->
          <div>
            <p class="tw:text-label tw:font-medium tw:text-on-main tw:mb-1.5">Email address</p>
            <div
              class="tw:flex tw:items-center tw:gap-2.5 tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover tw:px-3.5 tw:py-2.5"
            >
              <IconMail :size="16" class="tw:shrink-0 tw:text-secondary" />
              <span class="tw:min-w-0 tw:flex-1 tw:truncate tw:text-sm tw:text-on-main">
                {{ user.email }}
              </span>
              <IconLock :size="14" class="tw:shrink-0 tw:text-secondary" aria-hidden="true" />
            </div>
            <p class="tw:mt-1.5 tw:text-caption tw:text-secondary">
              Contact an administrator to change the email you sign in with.
            </p>
          </div>

          <!-- Color -->
          <div>
            <p class="tw:text-label tw:font-medium tw:text-on-main tw:mb-1.5">Your color</p>
            <div
              class="tw:flex tw:items-center tw:gap-3.5 tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover tw:px-3.5 tw:py-3"
            >
              <BaseColorPicker v-model="user.color" />
              <div class="tw:min-w-0">
                <p class="tw:text-sm tw:font-semibold tw:text-on-main">
                  {{ user.color || '#2563eb' }}
                </p>
                <p class="tw:text-caption tw:text-secondary">
                  Used for your avatar and identification
                </p>
              </div>
            </div>
          </div>
        </div>
      </BaseCard>
    </PageSection>

    <!-- ── Preferences ─────────────────────────────────────────────────── -->
    <PageSection title="Preferences" :icon="IconAdjustments">
      <BaseCard>
        <div class="tw:flex tw:flex-col tw:gap-5">
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-4">
            <BaseField label="Preferred language">
              <LanguageSelectMenu v-model="user.languageId" :required="true" />
            </BaseField>
            <TimezoneDropdown v-model="user.timeZone" label="Timezone" />
          </div>

          <!-- Appearance -->
          <div
            class="tw:flex tw:items-center tw:justify-between tw:gap-4 tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover tw:px-3.5 tw:py-3"
          >
            <div class="tw:flex tw:min-w-0 tw:items-center tw:gap-3">
              <div
                class="tw:flex tw:size-9 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg tw:bg-primary/10"
              >
                <IconPalette :size="18" class="tw:text-primary" />
              </div>
              <div class="tw:min-w-0">
                <p class="tw:text-sm tw:font-medium tw:text-on-main">Appearance</p>
                <p class="tw:text-caption tw:text-secondary">
                  Switch between light and dark themes
                </p>
              </div>
            </div>
            <ThemeToggle :size="20" class="tw:shrink-0" />
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
