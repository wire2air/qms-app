<script setup>
import { IconPaperclip, IconX } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { uploadFile } from '@/composables/useFileUpload'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const router = useRouter()
const toast = useToast()
const saving = ref(false)

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

async function handleSubmit() {
  if (!form.value.subject.trim()) {
    toast.notify({ type: 'negative', message: 'Subject is required' })
    return
  }
  saving.value = true
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
    router.push(getCompanyPath(`/customer-complaints/${response.customerComplaint.id}`))
  } catch (e) {
    toast.notify({ type: 'negative', message: e.message || 'Failed to create complaint' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:h-full">
    <SafeTeleport to="#main-header-title">
      <BaseBreadcrumbs
        :items="[
          { label: 'Customer Complaints', to: getCompanyPath('/customer-complaints') },
          { label: 'New Complaint' },
        ]"
      />
    </SafeTeleport>

    <SafeTeleport to="#main-header-actions">
      <BaseButton variant="primary" :disabled="saving || uploading" @click="handleSubmit">
        {{ saving ? 'Creating…' : 'Create Complaint' }}
      </BaseButton>
    </SafeTeleport>

    <div class="tw:overflow-y-auto tw:flex-1">
      <div class="tw:max-w-3xl tw:mx-auto tw:p-6 tw:flex tw:flex-col tw:gap-4">
        <!-- Complaint details -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <div
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Complaint details
          </div>
          <div class="tw:flex tw:flex-col tw:gap-3">
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Subject <span class="tw:text-red-500">*</span>
              </label>
              <BaseTextInput v-model="form.subject" placeholder="Short summary of the complaint…" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Description</label>
              <BaseTextarea
                v-model="form.description"
                placeholder="Describe the complaint in the customer's words…"
                :rows="5"
              />
            </div>
            <div class="tw:grid tw:grid-cols-2 tw:gap-3">
              <div class="tw:flex tw:flex-col tw:gap-1">
                <label class="tw:text-sm tw:font-medium tw:text-secondary">Source</label>
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
              </div>
              <div class="tw:flex tw:flex-col tw:gap-1">
                <label class="tw:text-sm tw:font-medium tw:text-secondary">Priority</label>
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
              </div>
            </div>
          </div>
        </div>

        <!-- Customer details -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <div
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            Customer details
          </div>
          <div class="tw:grid tw:grid-cols-2 tw:gap-3">
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Name</label>
              <BaseTextInput v-model="form.customerName" placeholder="Customer contact name" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Email</label>
              <BaseTextInput
                v-model="form.customerEmail"
                type="email"
                placeholder="customer@example.com"
              />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Company</label>
              <BaseTextInput v-model="form.customerCompany" placeholder="Customer company" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Phone</label>
              <BaseTextInput v-model="form.customerPhone" placeholder="Phone number" />
            </div>
          </div>
        </div>

        <!-- Attachments -->
        <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-5">
          <div
            class="tw:flex tw:items-center tw:justify-between tw:pb-3 tw:border-b tw:border-divider tw:mb-4"
          >
            <div
              class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider"
            >
              Attachments
            </div>
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
          </div>
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
        </div>
      </div>
    </div>
  </div>
</template>
