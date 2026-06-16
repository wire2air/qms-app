<script setup>
import { IconFile, IconCircleCheck, IconCircleX, IconExternalLink } from '@tabler/icons-vue'
import { get, post } from '@/api'
import { useToast } from '@shared/composables/useToast.js'

const props = defineProps({
  assetRequestId: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['done'])

const show = defineModel({ type: Boolean, default: false })

const toast = useToast()

const assetRequest = ref(null)
const loading = ref(false)
const submitting = ref(false)
const action = ref(null) // 'accept' | 'reject'
const reviewNote = ref('')

watch(show, (val) => {
  if (val && props.assetRequestId) {
    fetchAssetRequest()
  } else {
    assetRequest.value = null
    action.value = null
    reviewNote.value = ''
  }
})

async function fetchAssetRequest() {
  loading.value = true
  const result = await get(`/v1/services/assetRequests/${props.assetRequestId}`, {})
  loading.value = false
  if (result.error) {
    toast.notify({ type: 'negative', message: result.error })
    show.value = false
    return
  }
  assetRequest.value = result.assetRequest
}

function selectAction(selected) {
  action.value = selected
  reviewNote.value = ''
}

async function onConfirm() {
  if (!action.value) return

  submitting.value = true

  let result
  if (action.value === 'accept') {
    result = await post(`/v1/services/assetRequests/${props.assetRequestId}/accept`, {})
  } else {
    result = await post(`/v1/services/assetRequests/${props.assetRequestId}/reject`, {
      reviewNote: reviewNote.value,
    })
  }

  submitting.value = false

  if (result.error) {
    toast.notify({ type: 'negative', message: result.error })
    return
  }

  toast.notify({
    type: 'positive',
    message: action.value === 'accept' ? 'Document accepted' : 'Document rejected',
  })
  show.value = false
  emit('done')
}
</script>

<template>
  <BaseDialog v-model="show" title="Review Document" :persistent="true">
    <div class="tw:p-4 tw:space-y-4">
      <!-- Loading -->
      <div v-if="loading" class="tw:flex tw:justify-center tw:py-8">
        <BaseSpinner size="md" />
      </div>

      <template v-else-if="assetRequest">
        <!-- Request summary -->
        <div class="tw:bg-main-hover tw:rounded-lg tw:p-3 tw:space-y-1">
          <p class="tw:text-sm tw:font-medium tw:text-on-main">{{ assetRequest.title }}</p>
          <p v-if="assetRequest.requestType" class="tw:text-xs tw:text-secondary">
            {{ assetRequest.requestType.name }}
          </p>
        </div>

        <!-- Uploaded document -->
        <div>
          <p
            class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wide tw:mb-2"
          >
            Submitted Document
          </p>
          <div
            v-if="assetRequest.asset"
            class="tw:flex tw:items-center tw:gap-3 tw:p-3 tw:bg-main-hover tw:rounded-lg tw:border tw:border-divider"
          >
            <IconFile :size="20" class="tw:text-primary tw:shrink-0" />
            <div class="tw:flex-1 tw:min-w-0">
              <p class="tw:text-sm tw:text-on-main tw:truncate">
                {{
                  assetRequest.asset.originalFilename || assetRequest.asset.filename || 'Document'
                }}
              </p>
              <p v-if="assetRequest.asset.mimeType" class="tw:text-xs tw:text-secondary">
                {{ assetRequest.asset.mimeType }}
              </p>
            </div>
            <a
              v-if="assetRequest.asset.url"
              :href="assetRequest.asset.url"
              target="_blank"
              rel="noopener noreferrer"
              class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-primary tw:hover:bg-main-hover tw:transition-colors"
              title="Open file"
            >
              <IconExternalLink :size="16" />
            </a>
          </div>
          <p v-else class="tw:text-sm tw:text-secondary tw:italic">No document uploaded yet.</p>
        </div>

        <!-- Action selection -->
        <div v-if="!action" class="tw:flex tw:gap-3">
          <BaseButton class="tw:flex-1" @click="selectAction('accept')">
            <IconCircleCheck :size="16" />
            <span>Accept</span>
          </BaseButton>
          <BaseButton class="tw:flex-1" variant="outline" @click="selectAction('reject')">
            <IconCircleX :size="16" />
            <span>Reject</span>
          </BaseButton>
        </div>

        <!-- Accept confirmation -->
        <div v-else-if="action === 'accept'" class="tw:space-y-3">
          <div
            class="tw:flex tw:items-center tw:gap-2 tw:p-3 tw:bg-green-50 tw:rounded-lg tw:border tw:border-green-200"
          >
            <IconCircleCheck :size="20" class="tw:text-green-600 tw:shrink-0" />
            <p class="tw:text-sm tw:text-on-main">
              The document will be marked as <strong>Accepted</strong> and the supplier will be
              notified.
            </p>
          </div>
          <BaseButton variant="text-link" size="sm" @click="action = null"> Back </BaseButton>
        </div>

        <!-- Reject form -->
        <div v-else-if="action === 'reject'" class="tw:space-y-3">
          <div
            class="tw:flex tw:items-center tw:gap-2 tw:p-3 tw:bg-red-50 tw:rounded-lg tw:border tw:border-red-200"
          >
            <IconCircleX :size="20" class="tw:text-red-600 tw:shrink-0" />
            <p class="tw:text-sm tw:text-on-main">
              Please provide a reason for rejection. This will be included in the email to the
              supplier.
            </p>
          </div>
          <BaseTextarea v-model="reviewNote" placeholder="Rejection reason" :rows="3" />
          <BaseButton variant="text-link" size="sm" @click="action = null"> Back </BaseButton>
        </div>
      </template>
    </div>

    <div class="tw:flex tw:justify-end tw:gap-2 tw:px-4 tw:pb-4">
      <BaseButton variant="outline" @click="show = false">Cancel</BaseButton>
      <BaseButton v-if="action === 'accept'" :disabled="submitting" @click="onConfirm">
        <BaseSpinner v-if="submitting" size="sm" color="white" />
        <span>{{ submitting ? 'Confirming...' : 'Confirm Accept' }}</span>
      </BaseButton>
      <BaseButton
        v-else-if="action === 'reject'"
        :disabled="!reviewNote.trim() || submitting"
        @click="onConfirm"
      >
        <BaseSpinner v-if="submitting" size="sm" color="white" />
        <span>{{ submitting ? 'Confirming...' : 'Confirm Reject' }}</span>
      </BaseButton>
    </div>
  </BaseDialog>
</template>
