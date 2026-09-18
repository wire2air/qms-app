<script setup>
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-vue'
import DynamicForm from '@/components/form/DynamicForm.js'
import { get, post } from '@/api'

const route = useRoute()
const toast = useToast()

// FORMS F-01/F-02. This param was `templateId` — the form's PRIMARY KEY, used
// directly as the public capability, which is why every ACTIVE template in every
// tenant was readable by anyone who had ever seen its id. It is a share TOKEN
// now: minted by the database when a form owner explicitly publishes, destroyed
// when they unpublish or archive, and unrelated to the row's id. The file is
// named [shareToken].vue so the route param carries the same name.
//
// The page treats it as opaque and forwards it verbatim; the backend is the only
// thing that knows what a valid token looks like (see publicFormShare.js — every
// refusal is the same 404, deliberately).
const shareToken = route.params.shareToken

const schema = ref(null)
const model = ref({})
const loading = ref(true)
const submitting = ref(false)
const error = ref(null)
const success = ref(false)
const recordNumber = ref(null)

async function fetchSchema() {
  error.value = null
  try {
    const data = await get(`/v1/services/public/formTemplates/${shareToken}`, {
      loader: loading,
      showError: false,
    })
    schema.value = data.schema
  } catch (err) {
    error.value = err.message
  }
}

async function onSubmit() {
  submitting.value = true
  try {
    const data = await post('/v1/services/public/records', {
      token: shareToken,
      payload: model.value,
    })

    recordNumber.value = data.record.recordNumber
    success.value = true
    model.value = {} // Reset form
    toast.success('Form submitted successfully')
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  success.value = false
  recordNumber.value = null
  model.value = {}
}

onMounted(() => {
  if (shareToken) {
    fetchSchema()
  } else {
    error.value = 'This link is not valid'
    loading.value = false
  }
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:min-h-screen tw:bg-main">
    <div class="tw:flex-1 tw:flex tw:items-center tw:justify-center">
      <div class="tw:w-full tw:max-w-200 tw:bg-sidebar tw:rounded-lg tw:shadow-lg tw:p-6 tw:m-4">
        <!-- Loading State -->
        <div v-if="loading" class="tw:text-center tw:py-16">
          <BaseSpinner size="lg" class="tw:mx-auto" />
          <div class="tw:text-secondary tw:mt-4">Loading form...</div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="tw:text-center tw:py-16 tw:text-bad">
          <IconAlertCircle :size="64" class="tw:mx-auto" />
          <div class="tw:text-xl tw:mt-4">{{ error }}</div>
        </div>

        <!-- Success State -->
        <div v-else-if="success" class="tw:text-center tw:py-16">
          <IconCircleCheck :size="64" class="tw:text-good tw:mx-auto" />
          <div class="tw:text-2xl tw:mt-4 tw:text-good">Submission Successful!</div>
          <p class="tw:text-secondary tw:mt-2">
            Your record has been created with number: <strong>{{ recordNumber }}</strong>
          </p>
          <button
            class="tw:mt-4 tw:py-2.5 tw:px-6 tw:rounded-lg tw:bg-primary tw:text-white tw:font-medium tw:text-sm tw:hover:opacity-90 tw:transition-opacity tw:cursor-pointer tw:border-0"
            @click="resetForm"
          >
            Submit Another Response
          </button>
        </div>

        <!-- Form -->
        <div v-else>
          <div class="tw:text-2xl tw:font-bold tw:mb-6 tw:text-center tw:text-on-sidebar">
            Form Submission
          </div>

          <DynamicForm
            v-if="schema"
            v-model="model"
            :fields="schema"
            :loading="submitting"
            @submit="onSubmit"
          >
            <template #footer="{ submit }">
              <div class="tw:flex tw:justify-end tw:mt-4">
                <BaseButton variant="primary" :disabled="submitting" @click="submit">
                  Submit
                </BaseButton>
              </div>
            </template>
          </DynamicForm>

          <div v-else class="tw:text-center tw:text-secondary">
            Form schema is empty or invalid.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: empty
</route>
