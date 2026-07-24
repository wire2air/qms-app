<script setup>
import { get } from '@/api'
import { IconAlertCircle, IconClockOff } from '@tabler/icons-vue'

const route = useRoute()
const token = route.params.token

const document = ref(null)
const version = ref(null)
const company = ref(null)
const loading = ref(true)
const error = ref(null)
const expired = ref(false)

async function fetchDocument() {
  try {
    const data = await get(`/v1/services/public/supplierDocuments/${token}`, {
      loader: loading,
      showError: false,
    })
    document.value = data.document
    version.value = data.version
    company.value = data.company
  } catch (err) {
    // get() throws an ApiError — status/message live on the instance itself, not
    // on a nested axios `response`. A revoked or expired share returns 410; the
    // old `err.response?.status` check was always undefined, so revoked links
    // fell through to the generic error instead of the "no longer available" view.
    if (err.status === 410) {
      expired.value = true
    } else {
      error.value = err.message || 'Failed to load document'
    }
  }
}

onMounted(() => {
  if (token) {
    fetchDocument()
  } else {
    error.value = 'Invalid link'
    loading.value = false
  }
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:min-h-screen tw:bg-main">
    <!-- Header -->
    <header
      v-if="company || loading"
      class="tw:bg-sidebar tw:border-b tw:border-divider tw:px-6 tw:py-4 tw:flex tw:items-center tw:gap-3"
    >
      <div class="tw:max-w-360 tw:mx-auto tw:w-full tw:flex tw:items-center tw:gap-3">
        <span class="tw:text-lg tw:font-semibold tw:text-on-sidebar">
          {{ company?.name || '&nbsp;' }}
        </span>
        <span class="tw:text-secondary tw:text-sm">— Shared Document</span>
      </div>
    </header>

    <div class="tw:flex-1 tw:max-w-360 tw:mx-auto tw:px-6 tw:py-8 tw:w-full">
      <!-- Loading -->
      <div v-if="loading" class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-24">
        <BaseSpinner size="lg" />
        <p class="tw:text-secondary tw:mt-4">Loading document...</p>
      </div>

      <!-- Expired / revoked -->
      <div
        v-else-if="expired"
        class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-24 tw:text-center"
      >
        <IconClockOff :size="56" class="tw:text-secondary tw:mb-4" />
        <h2 class="tw:text-2xl tw:font-bold tw:text-on-sidebar tw:mb-2">
          Link No Longer Available
        </h2>
        <p class="tw:text-secondary">
          This document link has been revoked or is no longer accessible.
        </p>
      </div>

      <!-- Error -->
      <div
        v-else-if="error"
        class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-24 tw:text-center"
      >
        <IconAlertCircle :size="56" class="tw:text-red-500 tw:mb-4" />
        <h2 class="tw:text-2xl tw:font-bold tw:text-on-sidebar tw:mb-2">Something went wrong</h2>
        <p class="tw:text-secondary">{{ error }}</p>
      </div>

      <!-- Document content -->
      <DocumentContentReadonly
        v-else-if="document && version"
        :document="document"
        :version="version"
      />
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: empty
</route>
