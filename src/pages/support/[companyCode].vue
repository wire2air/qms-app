<script setup>
import { IconShieldCheck, IconCircleCheck, IconSend, IconMessageCircle } from '@tabler/icons-vue'
import { post } from '@/api'

defineOptions({
  name: 'PublicSupportPage',
})

const route = useRoute()
const toast = useToast()

const companyCode = computed(() => String(route.params.companyCode || '').toLowerCase())

const form = ref({
  customerName: '',
  customerEmail: '',
  subject: '',
  description: '',
})

const submitting = ref(false)
const result = ref(null)

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '')
}

const canSubmit = computed(
  () =>
    Boolean(form.value.subject.trim()) &&
    isValidEmail(form.value.customerEmail) &&
    !submitting.value,
)

async function handleSubmit() {
  if (!canSubmit.value) {
    if (!form.value.subject.trim()) {
      toast.notify({ type: 'negative', message: 'Subject is required' })
    } else if (!isValidEmail(form.value.customerEmail)) {
      toast.notify({ type: 'negative', message: 'Enter a valid email' })
    }
    return
  }
  submitting.value = true
  try {
    // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
    // This endpoint is public; no session, no syncEngine involvement.
    const res = await post(
      `/v1/services/public/customerComplaints/${companyCode.value}`,
      {
        subject: form.value.subject.trim(),
        description: form.value.description.trim() || null,
        customerName: form.value.customerName.trim() || null,
        customerEmail: form.value.customerEmail.trim(),
      },
      { showError: false },
    )
    result.value = {
      complaintNumber: res.complaintNumber,
      companyName: res.companyName,
      customerEmail: form.value.customerEmail.trim(),
    }
  } catch (err) {
    toast.notify({
      type: 'negative',
      message: err?.message || 'Could not submit. Please try again.',
    })
  } finally {
    submitting.value = false
  }
}

function submitAnother() {
  result.value = null
  form.value = { customerName: '', customerEmail: '', subject: '', description: '' }
}
</script>

<template>
  <div class="support-page">
    <div class="support-container">
      <!-- Left: branding -->
      <div class="support-branding">
        <div class="branding-content">
          <IconShieldCheck :size="48" class="tw:text-white" />
          <h1 class="branding-title">QMS Support</h1>
          <p class="branding-subtitle">Tell us what's going wrong — we'll take it from here.</p>
          <div class="branding-features">
            <div class="tw:flex tw:items-center tw:gap-2 tw:mb-4">
              <IconCircleCheck :size="20" class="tw:text-white" />
              <span>Tracked from intake to resolution</span>
            </div>
            <div class="tw:flex tw:items-center tw:gap-2 tw:mb-4">
              <IconCircleCheck :size="20" class="tw:text-white" />
              <span>Reply by email — your ticket stays threaded</span>
            </div>
            <div class="tw:flex tw:items-center tw:gap-2">
              <IconCircleCheck :size="20" class="tw:text-white" />
              <span>Escalated to a formal investigation when needed</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: form -->
      <div class="support-form-section">
        <div class="support-form-inner">
          <!-- Success state -->
          <div v-if="result" class="tw:flex tw:flex-col tw:gap-4 tw:items-center tw:text-center">
            <div
              class="tw:w-14 tw:h-14 tw:rounded-full tw:bg-emerald-100 tw:text-emerald-600 tw:flex tw:items-center tw:justify-center"
            >
              <IconCircleCheck :size="32" />
            </div>
            <div class="tw:flex tw:flex-col tw:gap-1">
              <h2 class="tw:text-2xl tw:font-bold tw:text-on-sidebar">Thanks — we've got it.</h2>
              <p class="tw:text-sm tw:text-secondary">
                Your ticket for <strong>{{ result.companyName }}</strong> is open.
              </p>
            </div>
            <div
              class="tw:bg-main-hover tw:rounded-lg tw:px-5 tw:py-3 tw:font-mono tw:text-lg tw:text-on-sidebar"
            >
              {{ result.complaintNumber }}
            </div>
            <p class="tw:text-sm tw:text-secondary tw:max-w-md">
              We'll reply to
              <strong class="tw:text-on-sidebar">{{ result.customerEmail }}</strong> shortly. If
              you reply, please keep
              <span class="tw:font-mono">[{{ result.complaintNumber }}]</span> in the subject so
              your reply lands on this ticket.
            </p>
            <BaseButton variant="outline" @click="submitAnother">
              Submit another complaint
            </BaseButton>
          </div>

          <!-- Form -->
          <div v-else class="tw:flex tw:flex-col tw:gap-4">
            <div class="tw:flex tw:items-center tw:gap-2">
              <IconMessageCircle :size="24" class="tw:text-primary" />
              <h2 class="tw:text-2xl tw:font-bold tw:text-on-sidebar">Tell us what happened</h2>
            </div>
            <p class="tw:text-sm tw:text-secondary">
              Fill in as much as you can — short is fine. The team that owns
              <span class="tw:font-mono">{{ companyCode }}</span> will pick it up.
            </p>

            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Your email <span class="tw:text-red-500">*</span>
              </label>
              <BaseTextInput
                v-model="form.customerEmail"
                type="email"
                placeholder="you@example.com"
                autocomplete="email"
                :disabled="submitting"
              />
            </div>

            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Your name</label>
              <BaseTextInput
                v-model="form.customerName"
                placeholder="Optional"
                autocomplete="name"
                :disabled="submitting"
              />
            </div>

            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">
                Subject <span class="tw:text-red-500">*</span>
              </label>
              <BaseTextInput
                v-model="form.subject"
                placeholder="Short summary of the issue"
                :disabled="submitting"
              />
            </div>

            <div class="tw:flex tw:flex-col tw:gap-1">
              <label class="tw:text-sm tw:font-medium tw:text-secondary">Details</label>
              <BaseTextarea
                v-model="form.description"
                rows="5"
                placeholder="What happened, when, and anything that will help us help you…"
                :disabled="submitting"
              />
            </div>

            <BaseButton
              variant="primary"
              :loading="submitting"
              :disabled="!canSubmit"
              @click="handleSubmit"
            >
              <template #icon><IconSend :size="16" /></template>
              Submit complaint
            </BaseButton>

            <p class="tw:text-xs tw:text-secondary tw:text-center">
              By submitting, you agree to be contacted at the email above about your ticket. We
              won't use your details for anything else.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.support-page {
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: stretch;
  justify-content: center;
  background-color: #f4f4f7;
}
.support-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 100%;
  max-width: 1100px;
  background-color: #ffffff;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}
.support-branding {
  background: linear-gradient(135deg, #1d4ed8 0%, #312e81 100%);
  color: #ffffff;
  padding: 56px 48px;
  display: flex;
  align-items: center;
}
.branding-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.branding-title {
  margin: 0;
  font-size: 32px;
  letter-spacing: -0.5px;
}
.branding-subtitle {
  margin: 0 0 16px;
  font-size: 15px;
  opacity: 0.85;
}
.branding-features {
  margin-top: 16px;
  font-size: 14px;
}
.support-form-section {
  padding: 56px 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.support-form-inner {
  width: 100%;
  max-width: 440px;
}
@media (max-width: 768px) {
  .support-container {
    grid-template-columns: 1fr;
  }
  .support-branding {
    padding: 32px 24px;
  }
  .support-form-section {
    padding: 32px 24px;
  }
}
</style>
