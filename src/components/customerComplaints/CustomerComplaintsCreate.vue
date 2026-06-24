<script setup>
import { IconPaperclip, IconX, IconInfoCircle, IconUser } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { uploadFile } from '@/composables/useFileUpload'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { required } from '@shared/components/form/validators.js'
import { useUnsavedChangesGuard } from '@shared/composables/useUnsavedChangesGuard.js'

const router = useRouter()
const toast = useToast()
const saving = ref(false)
// Server-side save failure — surfaced persistently in the form footer.
const submitError = ref('')

const form = ref({
  subject: '',
  description: '',
  priorityId: null,
  sourceId: 'WEB',
  customerName: '',
  customerEmail: '',
  customerCompany: '',
  customerPhone: '',
})

// Files are uploaded immediately (assets), then linked to the complaint
// at create time via assetIds — mirrors how evidence flows pre-upload.
const pendingAssets = ref([])
const uploading = ref(false)
const fileInputRef = ref(null)

// Unsaved-changes marker for the footer + BaseForm's beforeunload guard.
const isDirty = ref(false)
watch(form, () => (isDirty.value = true), { deep: true })

// Confirm before abandoning a half-filled complaint via in-app navigation
// (Cancel, back, sidebar). allowLeave() is called before the post-save
// redirect so a successful create doesn't prompt. BaseForm covers the
// browser-level exit.
const { allowLeave } = useUnsavedChangesGuard(isDirty)

// Sticky section nav (FormProgressNav). Section ids mirror the FormSection ids
// below; status shows a check once a section's required fields are satisfied.
const navSections = computed(() => [
  {
    id: 'cc-details',
    label: 'Details',
    icon: IconInfoCircle,
    status: form.value.subject.trim() ? 'complete' : null,
  },
  {
    id: 'cc-customer',
    label: 'Customer',
    icon: IconUser,
    status: null,
  },
  {
    id: 'cc-attachments',
    label: 'Attachments',
    icon: IconPaperclip,
    status: pendingAssets.value.length ? 'complete' : null,
  },
])

function onPickFiles() {
  fileInputRef.value?.click()
}

async function onFilesSelected(event) {
  const files = [...(event.target.files ?? [])]
  event.target.value = ''
  if (!files.length) return
  uploading.value = true
  try {
    for (const file of files) {
      const result = await uploadFile(file, 'ASSET')
      if (result.success) {
        pendingAssets.value.push(result.asset)
      } else {
        toast.notify({ type: 'negative', message: result.error || `Failed to upload ${file.name}` })
      }
    }
  } finally {
    uploading.value = false
  }
}

function removePendingAsset(assetId) {
  pendingAssets.value = pendingAssets.value.filter((a) => a.id !== assetId)
}

function goBack() {
  router.push(getCompanyPath('/customer-complaints'))
}

// Fires only after BaseForm's per-field rules pass.
async function onSubmit() {
  saving.value = true
  submitError.value = ''
  try {
    const response = await post('/v1/services/customerComplaints', {
      subject: form.value.subject.trim(),
      description: form.value.description || null,
      priorityId: form.value.priorityId,
      sourceId: form.value.sourceId || 'WEB',
      customerName: form.value.customerName || null,
      customerEmail: form.value.customerEmail || null,
      customerCompany: form.value.customerCompany || null,
      customerPhone: form.value.customerPhone || null,
      assetIds: pendingAssets.value.map((a) => a.id),
    })
    allowLeave() // saved — don't prompt on the redirect
    router.push(getCompanyPath(`/customer-complaints/${response.customerComplaint.id}`))
  } catch (e) {
    submitError.value = e.message || 'Failed to create complaint'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BasePage width="standard" fullHeight>
    <PageHeader>
      <template #title>
        <BaseBreadcrumbs
          :items="[
            { label: 'Customer Complaints', to: getCompanyPath('/customer-complaints') },
            { label: 'New Complaint' },
          ]"
        />
      </template>
    </PageHeader>

    <div class="tw:overflow-y-auto tw:flex-1 tw:min-h-0">
      <div class="tw:sticky tw:top-0 tw:z-10 tw:bg-main">
        <FormProgressNav :sections="navSections" />
      </div>
      <BaseForm
        class="tw:py-6"
        :dirty="isDirty"
        :loading="saving || uploading"
        :submitError="submitError"
        submitLabel="Create Complaint"
        @submit="onSubmit"
        @cancel="goBack"
      >
        <!-- Complaint details -->
        <FormSection id="cc-details" title="Complaint details" :icon="IconInfoCircle">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <BaseField
              id="cc-subject"
              label="Subject"
              required
              :value="form.subject"
              :rules="[required()]"
            >
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.subject"
                  placeholder="Short summary of the complaint…"
                />
              </template>
            </BaseField>
            <BaseField label="Description">
              <BaseTextarea
                v-model="form.description"
                placeholder="Describe the complaint in the customer's words…"
                :rows="5"
              />
            </BaseField>
            <BaseFieldRow :columns="2">
              <BaseField label="Source">
                <div class="tw:flex tw:gap-2">
                  <BaseButton
                    v-for="s in ['WEB', 'PHONE', 'OTHER']"
                    :key="s"
                    class="tw:flex-1 tw:justify-center"
                    :variant="form.sourceId === s ? 'primary' : 'outline'"
                    @click="form.sourceId = s"
                  >
                    {{ s.charAt(0) + s.slice(1).toLowerCase() }}
                  </BaseButton>
                </div>
              </BaseField>
              <BaseField label="Priority">
                <div class="tw:flex tw:gap-2">
                  <BaseButton
                    v-for="p in ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']"
                    :key="p"
                    class="tw:flex-1 tw:justify-center"
                    :variant="form.priorityId === p ? 'primary' : 'outline'"
                    @click="form.priorityId = form.priorityId === p ? null : p"
                  >
                    {{ p.charAt(0) + p.slice(1).toLowerCase() }}
                  </BaseButton>
                </div>
              </BaseField>
            </BaseFieldRow>
          </div>
        </FormSection>

        <!-- Customer details -->
        <FormSection
          id="cc-customer"
          title="Customer details"
          :icon="IconUser"
          optional
          collapsible
          :defaultOpen="false"
        >
          <BaseFieldRow :columns="2">
            <BaseField label="Name">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.customerName"
                  placeholder="Customer contact name"
                />
              </template>
            </BaseField>
            <BaseField label="Email">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.customerEmail"
                  type="email"
                  placeholder="customer@example.com"
                />
              </template>
            </BaseField>
            <BaseField label="Company">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.customerCompany"
                  placeholder="Customer company"
                />
              </template>
            </BaseField>
            <BaseField label="Phone">
              <template #default="field">
                <BaseTextInput
                  v-bind="field"
                  v-model="form.customerPhone"
                  placeholder="Phone number"
                />
              </template>
            </BaseField>
          </BaseFieldRow>
        </FormSection>

        <!-- Attachments -->
        <FormSection
          id="cc-attachments"
          title="Attachments"
          :icon="IconPaperclip"
          optional
          collapsible
          :defaultOpen="false"
        >
          <template #actions>
            <BaseButton variant="outline" size="sm" :disabled="uploading" @click="onPickFiles">
              <IconPaperclip :size="16" class="tw:mr-1" />
              {{ uploading ? 'Uploading…' : 'Add files' }}
            </BaseButton>
            <input
              ref="fileInputRef"
              type="file"
              multiple
              class="tw:hidden"
              @change="onFilesSelected"
            />
          </template>
          <div v-if="pendingAssets.length" class="tw:flex tw:flex-col tw:gap-2">
            <div
              v-for="asset in pendingAssets"
              :key="asset.id"
              class="tw:flex tw:items-center tw:justify-between tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2"
            >
              <span class="tw:text-sm tw:font-medium tw:truncate">
                {{ asset.originalFilename || asset.filename }}
              </span>
              <button
                class="tw:text-secondary tw:hover:text-red-600"
                @click="removePendingAsset(asset.id)"
              >
                <IconX :size="16" />
              </button>
            </div>
          </div>
          <div v-else class="tw:text-sm tw:text-secondary tw:italic">No files attached yet.</div>
        </FormSection>
      </BaseForm>
    </div>
  </BasePage>
</template>
