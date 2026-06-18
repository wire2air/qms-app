<script setup>
import {
  IconTruck,
  IconInfoCircle,
  IconMapPin,
  IconMail,
  IconShieldCheck,
  IconFileCheck,
  IconPlus,
  IconX,
  IconChevronRight,
} from '@tabler/icons-vue'
import { put } from '@/api'
import { uploadFiles } from '@/utils/uploadService.js'
import { useToast } from '@shared/composables/useToast.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()
const toast = useToast()

const saving = ref(false)
const isChecking = ref(false)
const isAvailable = ref(null)
const codeError = ref(null)
const nameError = ref(null)
const categoryError = ref(null)
const generalError = ref(null)

const countryOptions = [
  'United States',
  'Canada',
  'United Kingdom',
  'Germany',
  'France',
  'Japan',
  'China',
  'Australia',
  'India',
  'Brazil',
]

function getDefaultForm() {
  return {
    name: '',
    code: '',
    category: null,
    streetAddress: '',
    city: '',
    stateProvince: '',
    zipPostalCode: '',
    country: null,
    riskLevel: null,
    contacts: [{ email: '', phoneNumber: '', isPrimary: true }],
    siteIds: [],
  }
}

const form = ref(getDefaultForm())

// ─── Certificate / license files ──────────────────────────────────────────────

const certificateFiles = ref([])
const licenseFiles = ref([])

function onCertificateChange(e) {
  certificateFiles.value = [...certificateFiles.value, ...Array.from(e.target.files)]
  e.target.value = null
}

function onLicenseChange(e) {
  licenseFiles.value = [...licenseFiles.value, ...Array.from(e.target.files)]
  e.target.value = null
}

function removeCertificate(index) {
  certificateFiles.value.splice(index, 1)
}

function removeLicense(index) {
  licenseFiles.value.splice(index, 1)
}

// ─── Code availability check ──────────────────────────────────────────────────

const checkAvailabilityDebounced = useDebounceFn(async (code) => {
  if (!code || code.trim().length < 2) return
  isChecking.value = true
  codeError.value = null
  try {
    const data = await put('/v1/services/suppliers/checkcode', {
      code: code.trim(),
      name: '',
      isNameCheck: false,
    })
    isAvailable.value = data?.message === 'available'
    if (!isAvailable.value) codeError.value = 'Code already in use'
  } catch {
    isAvailable.value = null
  } finally {
    isChecking.value = false
  }
}, 500)

watch(
  () => form.value.code,
  (code) => {
    isAvailable.value = null
    codeError.value = null
    checkAvailabilityDebounced(code)
  },
)

async function onNameBlur() {
  if (!form.value.name || form.value.code) return
  try {
    const data = await put('/v1/services/suppliers/checkcode', {
      code: null,
      name: form.value.name,
      isNameCheck: true,
    })
    if (data?.suggestedCode) form.value.code = data.suggestedCode
  } catch {
    // ignore
  }
}

// ─── Contacts management ──────────────────────────────────────────────────────

function addContact() {
  form.value.contacts.push({ email: '', phoneNumber: '', isPrimary: false })
}

function removeContact(index) {
  const wasPrimary = form.value.contacts[index].isPrimary
  form.value.contacts.splice(index, 1)
  if (wasPrimary && form.value.contacts.length > 0) {
    form.value.contacts[0].isPrimary = true
  }
}

function setPrimary(index) {
  form.value.contacts.forEach((c, i) => {
    c.isPrimary = i === index
  })
}

const hasPrimaryContact = computed(() =>
  form.value.contacts.some((c) => c.isPrimary && (c.email?.trim() || c.phoneNumber?.trim())),
)

// ─── Create mutation ──────────────────────────────────────────────────────────

const createSupplier = useLiveMutation(async (db, payload) => {
  // 1. Create Supplier
  const supplier = db.Supplier.create({
    name: payload.name,
    code: payload.code,
    category: payload.category,
    streetAddress: payload.streetAddress,
    city: payload.city,
    stateProvince: payload.stateProvince,
    zipPostalCode: payload.zipPostalCode,
    country: payload.country,
    riskLevel: payload.riskLevel,
    statusId: 'PENDING',
  })
  await supplier.save()

  // 2. Create contacts
  for (const c of payload.contacts) {
    const contact = db.SupplierContact.create({
      supplierId: supplier.id,
      email: c.email,
      phoneNumber: c.phoneNumber,
      isPrimary: c.isPrimary,
    })
    await contact.save()
  }

  // 3. Assign sites
  for (const siteId of payload.siteIds) {
    const link = db.SupplierOnSite.create({ supplierId: supplier.id, siteId })
    await link.save()
  }

  // 4. Upload and attach compliance docs
  if (payload.certificateAssets?.length) {
    for (const asset of payload.certificateAssets) {
      const doc = db.SupplierAsset.create({
        supplierId: supplier.id,
        assetId: asset.id,
        documentType: 'certificate',
      })
      await doc.save()
    }
  }
  if (payload.licenseAssets?.length) {
    for (const asset of payload.licenseAssets) {
      const doc = db.SupplierAsset.create({
        supplierId: supplier.id,
        assetId: asset.id,
        documentType: 'license',
      })
      await doc.save()
    }
  }

  return supplier
})

// ─── Validation & submit ──────────────────────────────────────────────────────

function validate() {
  let valid = true
  nameError.value = null
  codeError.value = null
  categoryError.value = null
  generalError.value = null

  if (!form.value.name.trim()) {
    nameError.value = 'Required'
    valid = false
  }
  if (!form.value.code.trim()) {
    codeError.value = 'Required'
    valid = false
  }
  if (!form.value.category) {
    categoryError.value = 'Required'
    valid = false
  }
  if (isAvailable.value !== true && form.value.code.trim()) {
    codeError.value = 'Check availability first'
    valid = false
  }
  if (!hasPrimaryContact.value) {
    generalError.value = 'At least one primary contact with email or phone is required'
    valid = false
  }
  return valid
}

async function saveSupplier() {
  if (!validate()) return

  saving.value = true
  try {
    const [certificateAssets, licenseAssets] = await Promise.all([
      certificateFiles.value.length
        ? uploadFiles(certificateFiles.value, 'ASSET')
        : Promise.resolve([]),
      licenseFiles.value.length ? uploadFiles(licenseFiles.value, 'ASSET') : Promise.resolve([]),
    ])

    const contacts = form.value.contacts.filter((c) => c.email?.trim() || c.phoneNumber?.trim())

    await createSupplier({
      name: form.value.name.trim(),
      code: form.value.code.trim(),
      category: form.value.category,
      streetAddress: form.value.streetAddress?.trim() || '',
      city: form.value.city?.trim() || '',
      stateProvince: form.value.stateProvince?.trim() || '',
      zipPostalCode: form.value.zipPostalCode?.trim() || '',
      country: form.value.country || '',
      riskLevel: form.value.riskLevel || '',
      contacts,
      siteIds: form.value.siteIds,
      certificateAssets,
      licenseAssets,
    })

    toast.notify({ type: 'positive', message: 'Supplier created successfully' })
    router.push(getCompanyPath('/suppliers'))
  } catch (err) {
    generalError.value = err.message || 'Failed to create supplier'
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push(getCompanyPath('/suppliers'))
}
</script>

<template>
  <BasePage width="standard" fullHeight>
    <PageHeader
      :icon="IconTruck"
      title="New Supplier Onboarding"
      subtitle="Complete the profile below to initiate the technical qualification and quality assurance audit for new supply partners."
    />

    <!-- Scrollable content -->
    <div class="tw:flex-1 tw:min-h-0 tw:overflow-y-auto tw:pb-24">
      <div class="tw:py-8">
        <!-- Breadcrumbs -->
        <div class="tw:mb-4 tw:flex tw:items-center tw:text-sm tw:text-secondary tw:gap-1">
          <BaseClickableRow
            tag="span"
            class="tw:hover:underline"
            aria-label="Back to Suppliers"
            @click="goBack"
            >Suppliers</BaseClickableRow
          >
          <IconChevronRight :size="14" />
          <span class="tw:text-on-sidebar tw:font-medium">Onboarding</span>
        </div>

        <!-- General error -->
        <div
          v-if="generalError"
          class="tw:mb-6 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200 tw:px-4 tw:py-3 tw:text-sm tw:text-red-600"
        >
          {{ generalError }}
        </div>

        <!-- Form Sections -->
        <div class="tw:space-y-8">
          <!-- Row 1: Basic Information + Contact Details -->
          <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-8">
            <!-- Basic Information -->
            <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
              <div
                class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:flex tw:items-center tw:gap-2"
              >
                <IconInfoCircle :size="20" class="tw:text-primary" />
                <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Basic Information</h2>
              </div>
              <div class="tw:p-6 tw:flex tw:flex-col tw:gap-4">
                <BaseField v-slot="{ id: fieldId }" label="Supplier Name" required>
                  <BaseTextInput
                    :id="fieldId"
                    v-model="form.name"
                    placeholder="e.g. Global Logistics Corp"
                    @blur="onNameBlur"
                  />
                  <p v-if="nameError" class="tw:text-xs tw:text-bad tw:mt-1">{{ nameError }}</p>
                </BaseField>

                <BaseField v-slot="{ id: fieldId }" label="Supplier Code" required>
                  <div class="tw:relative">
                    <BaseTextInput :id="fieldId" v-model="form.code" placeholder="e.g. SUP-2024-001" />
                    <BaseSpinner
                      v-if="isChecking"
                      size="sm"
                      class="tw:absolute tw:right-2 tw:top-1/2 tw:-translate-y-1/2"
                    />
                  </div>
                  <p v-if="codeError" class="tw:text-xs tw:text-bad tw:mt-1">{{ codeError }}</p>
                  <p v-else-if="isAvailable === true" class="tw:text-xs tw:text-green-600 tw:mt-1">
                    Code available
                  </p>
                </BaseField>

                <BaseField label="Category" required>
                  <SupplierCategorySelectMenu v-model="form.category" :required="true" />
                  <p v-if="categoryError" class="tw:text-xs tw:text-bad tw:mt-1">
                    {{ categoryError }}
                  </p>
                </BaseField>
              </div>
            </div>

            <!-- Contact Details -->
            <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
              <div
                class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:flex tw:items-center tw:gap-2"
              >
                <IconMail :size="20" class="tw:text-primary" />
                <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Contact Details</h2>
              </div>
              <div class="tw:p-6 tw:flex tw:flex-col tw:gap-4">
                <div v-if="form.contacts.length > 0" class="tw:space-y-3">
                  <BaseText variant="overline">Contacts</BaseText>
                  <div
                    v-for="(contact, index) in form.contacts"
                    :key="index"
                    class="tw:flex tw:flex-col tw:gap-3 tw:p-4 tw:border tw:border-divider tw:rounded-lg"
                  >
                    <BaseTextInput v-model="contact.email" placeholder="email@supplier.com" />
                    <BaseTextInput v-model="contact.phoneNumber" placeholder="+1 (555) 000-0000" />
                    <div class="tw:flex tw:items-center tw:justify-between">
                      <BaseSwitch
                        :modelValue="contact.isPrimary"
                        label="Primary"
                        :disabled="contact.isPrimary"
                        @update:modelValue="setPrimary(index)"
                      />
                      <BaseButton
                        v-if="form.contacts.length > 1"
                        variant="text"
                        iconOnly
                        size="sm"
                        @click="removeContact(index)"
                      >
                        <IconX :size="16" />
                      </BaseButton>
                    </div>
                  </div>
                </div>
                <BaseButton variant="text-link" size="sm" @click="addContact">
                  <IconPlus :size="14" />
                  Add Contact
                </BaseButton>
              </div>
            </div>
          </div>

          <!-- Row 2: Registered Address -->
          <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
            <div
              class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:flex tw:items-center tw:gap-2"
            >
              <IconMapPin :size="20" class="tw:text-primary" />
              <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Registered Address</h2>
            </div>
            <div class="tw:p-6 tw:grid tw:grid-cols-1 tw:md:grid-cols-3 tw:gap-4">
              <BaseField v-slot="{ id: fieldId }" label="Street Address" class="tw:md:col-span-2">
                <BaseTextInput :id="fieldId" v-model="form.streetAddress" placeholder="123 Industrial Parkway" />
              </BaseField>
              <BaseField v-slot="{ id: fieldId }" label="City">
                <BaseTextInput :id="fieldId" v-model="form.city" placeholder="New York" />
              </BaseField>
              <BaseField v-slot="{ id: fieldId }" label="State/Province">
                <BaseTextInput :id="fieldId" v-model="form.stateProvince" placeholder="NY" />
              </BaseField>
              <BaseField v-slot="{ id: fieldId }" label="Zip/Postal Code">
                <BaseTextInput :id="fieldId" v-model="form.zipPostalCode" placeholder="10001" />
              </BaseField>
              <BaseField v-slot="{ id: fieldId }" label="Country">
                <select :id="fieldId" v-model="form.country" class="tw:w-full">
                  <option :value="null">-- Select country --</option>
                  <option v-for="opt in countryOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </BaseField>
            </div>
          </div>

          <!-- Site Assignment -->
          <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
            <div
              class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:flex tw:items-center tw:gap-2"
            >
              <IconMapPin :size="20" class="tw:text-primary" />
              <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Site Assignment</h2>
            </div>
            <div class="tw:p-6">
              <SiteSelectMenu v-model="form.siteIds" :multiple="true" />
            </div>
          </div>

          <!-- Row 3: Risk Assessment + Compliance Documents -->
          <div class="tw:grid tw:grid-cols-1 tw:lg:grid-cols-3 tw:gap-8">
            <!-- Risk Assessment -->
            <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden">
              <div
                class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:flex tw:items-center tw:gap-2"
              >
                <IconShieldCheck :size="20" class="tw:text-primary" />
                <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Risk Assessment</h2>
              </div>
              <div class="tw:p-6">
                <BaseText variant="overline" class="tw:block tw:mb-3">Self-Declared Risk Level</BaseText>
                <SupplierRiskLevelSelectMenu v-model="form.riskLevel" />
              </div>
            </div>

            <!-- Compliance Documents -->
            <div
              class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden tw:lg:col-span-2"
            >
              <div
                class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:flex tw:items-center tw:gap-2"
              >
                <IconFileCheck :size="20" class="tw:text-primary" />
                <h2 class="tw:text-lg tw:font-bold tw:text-on-sidebar">Compliance Documents</h2>
              </div>
              <div class="tw:p-6 tw:space-y-6">
                <!-- Certificates -->
                <BaseField label="Certificates">
                  <div v-if="certificateFiles.length" class="tw:mb-2 tw:space-y-1">
                    <div
                      v-for="(file, i) in certificateFiles"
                      :key="i"
                      class="tw:flex tw:items-center tw:justify-between tw:text-sm tw:text-secondary"
                    >
                      <span class="tw:truncate">{{ file.name }}</span>
                      <BaseButton variant="text" iconOnly size="xs" @click="removeCertificate(i)">
                        <IconX :size="14" />
                      </BaseButton>
                    </div>
                  </div>
                  <label
                    class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:text-primary tw:cursor-pointer tw:hover:underline"
                  >
                    <IconPlus :size="14" />
                    Add Certificate
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      multiple
                      class="tw:hidden"
                      @change="onCertificateChange"
                    />
                  </label>
                </BaseField>

                <!-- Licenses -->
                <BaseField label="Licenses">
                  <div v-if="licenseFiles.length" class="tw:mb-2 tw:space-y-1">
                    <div
                      v-for="(file, i) in licenseFiles"
                      :key="i"
                      class="tw:flex tw:items-center tw:justify-between tw:text-sm tw:text-secondary"
                    >
                      <span class="tw:truncate">{{ file.name }}</span>
                      <BaseButton variant="text" iconOnly size="xs" @click="removeLicense(i)">
                        <IconX :size="14" />
                      </BaseButton>
                    </div>
                  </div>
                  <label
                    class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:text-primary tw:cursor-pointer tw:hover:underline"
                  >
                    <IconPlus :size="14" />
                    Add License
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      multiple
                      class="tw:hidden"
                      @change="onLicenseChange"
                    />
                  </label>
                </BaseField>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sticky Footer Action Bar -->
    <div
      class="tw:sticky tw:bottom-0 tw:w-full tw:bg-main/80 tw:backdrop-blur-md tw:border-t tw:border-divider tw:px-6 tw:py-4 tw:z-modal"
    >
      <div class="tw:flex tw:items-center tw:justify-between">
        <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-secondary">
          <span class="tw:w-2 tw:h-2 tw:rounded-full tw:bg-warning tw:animate-pulse" />
          Unsaved changes
        </div>
        <div class="tw:flex tw:items-center tw:gap-4">
          <BaseButton variant="secondary" :disabled="saving" @click="goBack"> Cancel </BaseButton>
          <BaseButton :disabled="saving" @click="saveSupplier">
            <BaseSpinner v-if="saving" size="sm" color="white" />
            <span>{{ saving ? 'Saving...' : 'Submit for Onboarding' }}</span>
          </BaseButton>
        </div>
      </div>
    </div>
  </BasePage>
</template>
