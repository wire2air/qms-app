<script setup>
import { IconBuilding, IconRotate } from '@tabler/icons-vue'
import { currentCompany } from '@/utils/currentCompany.js'

/**
 * Print branding settings — stored as company.settings.printSettings JSON.
 * Read by components/print/PrintLayout.vue with sensible fallbacks per field.
 *
 * Auto-saves on change with a debounced model save, matching the pattern
 * used by the other Company* cards.
 */

const company = useLiveQueryWithDeps(
  [() => currentCompany.value?.id],
  async (db, [id]) => {
    if (!id) return null
    return db.Company.findByPk(id)
  },
  { models: ['Company'] },
)

const isSaving = ref(false)
const saveError = ref(null)
const isFirstChange = ref(true)

// Ensure the nested settings.printSettings object exists so the inputs can
// bind directly to it via v-model. Backfilled lazily so we don't trigger a
// write just by opening the tab.
function ensurePrintSettings(c) {
  if (!c) return
  if (c.settings == null) c.settings = {}
  if (c.settings.printSettings == null) c.settings.printSettings = {}
}
watch(company, (c) => ensurePrintSettings(c), { immediate: true })

const ps = computed(() => company.value?.settings?.printSettings ?? {})

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

watch(
  () => company.value?.settings?.printSettings,
  () => {
    if (isFirstChange.value) {
      isFirstChange.value = false
      return
    }
    debouncedSave()
  },
  { deep: true },
)

function resetField(key) {
  if (!company.value?.settings?.printSettings) return
  company.value.settings.printSettings[key] = null
}

// Defaults that PrintLayout falls back to — shown as placeholders + hints.
const fallbackLogo = computed(() => company.value?.companyIconUrl || null)
const defaultFooterText = 'Verify the current effective version before use.'

function openPreview() {
  // Use the centralised print URL with module=Document. We don't know what
  // document the user wants — let them click into any document and use the
  // page's Print button. This is just a hint to make the connection clear.
  window.open(
    `/${currentCompany.value?.code}/documents`,
    '_blank',
    'noopener,noreferrer',
  )
}
</script>

<template>
  <div
    v-if="company"
    class="tw:rounded-xl tw:border tw:border-divider tw:shadow-sm tw:overflow-hidden tw:bg-sidebar"
  >
    <BaseSectionHeader
      title="Print Settings"
      subtitle="Branding used by the centralised document printout (and other modules later)."
      :level="2"
      size="section-title"
      class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover"
    >
      <template #actions>
        <CompanyCardSaveStatus :saving="isSaving" :error="saveError" />
      </template>
    </BaseSectionHeader>

    <div class="tw:p-6 tw:flex tw:flex-col tw:gap-8">
      <!-- Logo -->
      <div class="tw:flex tw:flex-col tw:gap-5">
        <BaseText variant="overline">Logo</BaseText>
        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-[1fr_auto] tw:gap-6 tw:items-start">
          <BaseField
            label="Logo URL (override)"
            hint="Falls back to the company icon set on the General tab, then to a &quot;Company Logo&quot; placeholder."
          >
            <div class="tw:flex tw:gap-2">
              <BaseTextInput
                v-model="company.settings.printSettings.logoUrl"
                placeholder="Defaults to the company icon below"
                class="tw:flex-1"
              />
              <button
                v-if="ps.logoUrl"
                class="tw:p-2 tw:rounded tw:border tw:border-divider tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
                title="Reset to company icon"
                @click="resetField('logoUrl')"
              >
                <IconRotate :size="14" />
              </button>
            </div>
          </BaseField>
          <div class="tw:flex tw:flex-col tw:items-center tw:gap-1.5">
            <span class="tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:tracking-wide">
              Preview
            </span>
            <div
              class="tw:w-24 tw:h-16 tw:rounded tw:border tw:border-divider tw:bg-white tw:flex tw:items-center tw:justify-center tw:p-2"
            >
              <img
                v-if="ps.logoUrl || fallbackLogo"
                :src="ps.logoUrl || fallbackLogo"
                alt="Print logo preview"
                class="tw:max-w-full tw:max-h-full tw:object-contain"
              />
              <div
                v-else
                class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:text-gray-400 tw:text-[9px] tw:text-center"
              >
                <IconBuilding :size="22" />
                <span>Company Logo</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <hr class="tw:border-divider" />

      <!-- Address -->
      <div class="tw:flex tw:flex-col tw:gap-5">
        <BaseText variant="overline">Mailing Address</BaseText>
        <BaseField
          v-slot="{ id: fieldId }"
          label="Address"
          hint="Printed under the company name in the document header."
        >
          <BaseTextarea
            :id="fieldId"
            v-model="company.settings.printSettings.address"
            placeholder="e.g. 123 Main St, Boston, MA 02110, USA"
            :rows="2"
          />
        </BaseField>
      </div>

      <hr class="tw:border-divider" />

      <!-- Footer + accent -->
      <div class="tw:flex tw:flex-col tw:gap-5">
        <BaseText variant="overline">Page Footer</BaseText>
        <BaseField v-slot="{ id: fieldId }" label="Footer notice">
          <BaseTextInput
            :id="fieldId"
            v-model="company.settings.printSettings.footerText"
            :placeholder="defaultFooterText"
          />
          <p class="tw:text-xs tw:text-secondary">
            Appears in the printed footer alongside status. Leave blank for the default:
            <em>“{{ defaultFooterText }}”</em>
          </p>
        </BaseField>

        <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-[1fr_auto] tw:gap-6 tw:items-end">
          <BaseField
            label="Accent colour"
            hint="Used on the print header divider, footer rule, section headings, and document title."
          >
            <div class="tw:flex tw:gap-2 tw:items-center">
              <input
                v-model="company.settings.printSettings.accentColor"
                type="color"
                class="tw:size-10 tw:rounded tw:border tw:border-divider tw:bg-main tw:cursor-pointer"
              />
              <BaseTextInput
                v-model="company.settings.printSettings.accentColor"
                placeholder="#111827"
                class="tw:flex-1 tw:font-mono"
              />
              <button
                v-if="ps.accentColor"
                class="tw:p-2 tw:rounded tw:border tw:border-divider tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
                title="Clear (use default black)"
                @click="resetField('accentColor')"
              >
                <IconRotate :size="14" />
              </button>
            </div>
          </BaseField>
        </div>
      </div>

      <hr class="tw:border-divider" />

      <!-- Preview hint -->
      <div class="tw:flex tw:items-center tw:justify-between tw:gap-4">
        <div class="tw:text-xs tw:text-secondary">
          To preview these settings, open any document and click <strong>Print</strong>.
        </div>
        <button
          class="tw:text-xs tw:font-medium tw:text-primary tw:hover:underline"
          @click="openPreview"
        >
          Open Documents →
        </button>
      </div>
    </div>
  </div>
</template>
