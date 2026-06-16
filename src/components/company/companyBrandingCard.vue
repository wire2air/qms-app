<script setup>
import { IconSun, IconMoon, IconUpload } from '@tabler/icons-vue'
import { uploadFile } from '@/utils/uploadService.js'
import { currentCompany } from '@/utils/currentCompany.js'
import { useToast } from '@shared/composables/useToast.js'

const company = useLiveQueryWithDeps(
  [() => currentCompany.value?.id],
  async (db, [id]) => {
    if (!id) return null
    return db.Company.findByPk(id)
  },
  { models: ['Company'] },
)

const toast = useToast()

const isSaving = ref(false)
const saveError = ref(null)
const isFirstChange = ref(true)

const debouncedSave = useDebounceFn(async () => {
  if (!company.value) return
  isSaving.value = true
  saveError.value = null
  try {
    await company.value.save()
  } catch (err) {
    saveError.value = err.message || 'Failed to save'
  } finally {
    isSaving.value = false
  }
}, 500)

watch([() => company.value?.companyIconUrl, () => company.value?.companyDarkIconUrl], () => {
  if (isFirstChange.value) {
    isFirstChange.value = false
    return
  }
  debouncedSave()
})

const showLightDialog = ref(false)
const showDarkDialog = ref(false)
const uploadingLight = ref(false)
const uploadingDark = ref(false)

async function handleLightSave({ file }) {
  if (!company.value) return
  uploadingLight.value = true
  try {
    const asset = await uploadFile(file, 'COMPANYLOGO')
    company.value.companyIconUrl = asset.url
    showLightDialog.value = false
    toast.notify({ type: 'positive', message: 'Light mode logo uploaded successfully' })
  } finally {
    uploadingLight.value = false
  }
}

async function handleDarkSave({ file }) {
  if (!company.value) return
  uploadingDark.value = true
  try {
    const asset = await uploadFile(file, 'COMPANYLOGO')
    company.value.companyDarkIconUrl = asset.url
    showDarkDialog.value = false
    toast.notify({ type: 'positive', message: 'Dark mode logo uploaded successfully' })
  } finally {
    uploadingDark.value = false
  }
}

function handleLightDelete() {
  if (!company.value) return
  company.value.companyIconUrl = null
  showLightDialog.value = false
}

function handleDarkDelete() {
  if (!company.value) return
  company.value.companyDarkIconUrl = null
  showDarkDialog.value = false
}
</script>

<template>
  <div
    v-if="company"
    class="tw:rounded-xl tw:border tw:border-divider tw:shadow-sm tw:overflow-hidden tw:bg-sidebar"
  >
    <div
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between"
    >
      <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Branding</h2>
      <CompanyCardSaveStatus :saving="isSaving" :error="saveError" />
    </div>

    <div class="tw:p-6">
      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-8">
        <!-- Light Mode Logo -->
        <div class="tw:flex tw:flex-col tw:gap-4">
          <label class="tw:text-sm tw:font-semibold tw:text-on-sidebar">Light Mode Logo</label>
          <div class="tw:flex tw:flex-col tw:gap-4">
            <div
              class="tw:size-32 tw:rounded-xl tw:border-2 tw:border-dashed tw:border-divider tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:text-secondary tw:bg-main-hover"
            >
              <img
                v-if="company.companyIconUrl"
                :src="company.companyIconUrl"
                alt="Light logo"
                class="tw:size-full tw:object-contain tw:rounded-xl"
              />
              <template v-else>
                <IconSun :size="48" class="tw:text-secondary tw:opacity-50" />
                <span class="ds-label-sm tw:text-center tw:px-2"> No icon uploaded </span>
              </template>
            </div>

            <div class="tw:flex tw:flex-col tw:gap-2">
              <p class="tw:text-xs tw:text-secondary tw:leading-relaxed">
                Used on light backgrounds. Recommended: 512x512px (PNG, SVG, or JPG)
              </p>
              <BaseButton
                variant="text-link"
                :disabled="uploadingLight || uploadingDark"
                @click="showLightDialog = true"
              >
                <IconUpload class="tw:size-4" />
                {{ uploadingLight ? 'Uploading...' : 'Upload Light Icon' }}
              </BaseButton>
            </div>
            <ImageCropDialog
              v-model="showLightDialog"
              title="Light Mode Logo"
              :currentImageUrl="company.companyIconUrl"
              @save="handleLightSave"
              @delete="handleLightDelete"
            />
          </div>
        </div>

        <!-- Dark Mode Logo -->
        <div class="tw:flex tw:flex-col tw:gap-4">
          <label class="tw:text-sm tw:font-semibold tw:text-on-sidebar">Dark Mode Logo</label>
          <div class="tw:flex tw:flex-col tw:gap-4">
            <div
              class="tw:size-32 tw:rounded-xl tw:border-2 tw:border-dashed tw:border-divider tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:text-secondary"
              :class="company.companyDarkIconUrl ? 'tw:bg-main-hover' : 'tw:bg-code'"
            >
              <img
                v-if="company.companyDarkIconUrl"
                :src="company.companyDarkIconUrl"
                alt="Dark logo"
                class="tw:size-full tw:object-contain tw:rounded-xl"
              />
              <template v-else>
                <IconMoon :size="48" class="tw:text-gray-400" />
                <span class="ds-label-sm tw:text-center tw:px-2 tw:text-gray-400">
                  No icon uploaded
                </span>
              </template>
            </div>

            <div class="tw:flex tw:flex-col tw:gap-2">
              <p class="tw:text-xs tw:text-secondary tw:leading-relaxed">
                Used on dark backgrounds. Recommended: 512x512px (PNG, SVG, or JPG)
              </p>
              <BaseButton
                variant="text-link"
                :disabled="uploadingLight || uploadingDark"
                @click="showDarkDialog = true"
              >
                <IconUpload class="tw:size-4" />
                {{ uploadingDark ? 'Uploading...' : 'Upload Dark Icon' }}
              </BaseButton>
            </div>
            <ImageCropDialog
              v-model="showDarkDialog"
              title="Dark Mode Logo"
              :currentImageUrl="company.companyDarkIconUrl"
              @save="handleDarkSave"
              @delete="handleDarkDelete"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
