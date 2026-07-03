<script setup>
import { IconCircleCheck, IconAlertTriangle } from '@tabler/icons-vue'
// Public intake page — no session. Same pattern as asset-request/[token].
import { get, post } from '@/api'

const route = useRoute()
const slug = computed(() => route.params.slug)

const loading = ref(true)
const loadError = ref(null)
const form = ref(null)

onMounted(async () => {
  try {
    const data = await get(`/v1/services/public/complaintForms/${slug.value}`, {
      showError: false,
    })
    form.value = data.form
  } catch {
    loadError.value = 'This form is not available. Check the link or contact support.'
  } finally {
    loading.value = false
  }
})

const submitting = ref(false)
const submitError = ref(null)
const submittedNumber = ref(null)
const submittedEmail = ref('')

async function handleSubmit({ systemValues, customValues }) {
  submitting.value = true
  submitError.value = null
  try {
    const response = await post(
      `/v1/services/public/complaintForms/${slug.value}/submit`,
      { ...systemValues, customFields: customValues },
      { showError: false },
    )
    submittedNumber.value = response.complaintNumber
    submittedEmail.value = systemValues.email
  } catch (e) {
    submitError.value = e.message || 'Something went wrong — please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <!-- h-screen + overflow-y-auto, not min-h-screen: the app shell locks the
       body (overflow-hidden) and sizes #app to the viewport, so this public
       page must own its own vertical scroll or tall forms get clipped and the
       Submit button becomes unreachable. -->
  <div
    class="tw:h-screen tw:overflow-y-auto tw:bg-gray-50 tw:py-10 tw:px-4"
    :style="form?.branding?.backgroundColor ? { backgroundColor: form.branding.backgroundColor } : {}"
  >
    <div class="tw:max-w-2xl tw:mx-auto">
      <!-- Loading -->
      <div v-if="loading" class="tw:flex tw:justify-center tw:py-20">
        <BaseSpinner size="md" />
      </div>

      <!-- Not found / inactive -->
      <div
        v-else-if="loadError"
        class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-10 tw:text-center"
      >
        <IconAlertTriangle :size="40" class="tw:text-amber-500 tw:mx-auto tw:mb-3" />
        <p class="tw:text-on-main">{{ loadError }}</p>
      </div>

      <!-- Success -->
      <div
        v-else-if="submittedNumber"
        class="tw:bg-white tw:rounded-xl tw:border tw:border-divider tw:p-10 tw:text-center"
      >
        <IconCircleCheck :size="48" class="tw:text-green-600 tw:mx-auto tw:mb-4" />
        <h2 class="tw:text-2xl tw:font-bold tw:text-on-main tw:mb-2">Thank you!</h2>
        <p class="tw:text-secondary tw:mb-4">
          Your complaint has been received{{ form?.companyName ? ` by ${form.companyName}` : '' }}.
          Our team will get back to you{{ submittedEmail ? ` at ${submittedEmail}` : '' }}.
        </p>
        <p class="tw:text-sm tw:text-secondary">
          Your reference number:
          <span class="tw:font-bold tw:text-on-main">{{ submittedNumber }}</span>
        </p>
      </div>

      <!-- The shared schema-driven renderer — same component the admin
           preview uses, fed by the server's resolved definition. -->
      <ComplaintFormRenderer
        v-else
        :definition="form"
        :submitting="submitting"
        :submitError="submitError"
        @submit="handleSubmit"
      />

      <p class="tw:text-center tw:text-xs tw:text-gray-400 tw:mt-4">Powered by Qability</p>
    </div>
  </div>
</template>
