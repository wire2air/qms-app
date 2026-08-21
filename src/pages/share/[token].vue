<script setup>
/**
 * The external view of a shared record — /share/:token
 *
 * Seen by people with no account: a customer who complained, a supplier's
 * quality lead, an auditor. They arrive from an email, verify a code sent to
 * that same address, and read one record.
 *
 * Three states, and the order matters: the code gate comes BEFORE anything
 * identifying the record. Someone who has the link but not the mailbox learns
 * only that a record of some type exists.
 *
 * Everything shown here comes from the server's curated projection. This page
 * renders labels and values it is handed — it has no model, no query, and no
 * way to ask for a field the projection did not include.
 */
import { IconLock, IconMail, IconAlertCircle } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, post } from '@/api'

defineOptions({ name: 'SharedRecordPage' })

const route = useRoute()
const token = computed(() => route.params.token)

const loading = ref(true)
const error = ref('')
const needsVerification = ref(false)
const maskedEmail = ref('')
const label = ref('record')
const record = ref(null)

const code = ref('')
const sending = ref(false)
const verifying = ref(false)
const codeSent = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await get(`/v1/share/${token.value}`)
    if (data.needsVerification) {
      needsVerification.value = true
      maskedEmail.value = data.maskedEmail
      label.value = data.label || 'record'
    } else {
      needsVerification.value = false
      record.value = data.record
      label.value = data.record?.label || 'record'
    }
  } catch (err) {
    // One message for expired, revoked and never-existed alike — the server
    // does not distinguish them and neither should the page.
    error.value = err?.response?.data?.message || 'This link is no longer valid.'
  } finally {
    loading.value = false
  }
}

async function requestCode() {
  sending.value = true
  error.value = ''
  try {
    const data = await post(`/v1/share/${token.value}/request-code`, {})
    maskedEmail.value = data.maskedEmail
    codeSent.value = true
  } catch (err) {
    error.value = err?.response?.data?.message || 'Could not send a code.'
  } finally {
    sending.value = false
  }
}

async function verify() {
  if (!code.value) return
  verifying.value = true
  error.value = ''
  try {
    await post(`/v1/share/${token.value}/verify`, { code: code.value })
    code.value = ''
    await load()
  } catch (err) {
    error.value = err?.response?.data?.message || 'That code is not correct.'
  } finally {
    verifying.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="tw:min-h-screen tw:bg-sidebar tw:py-10 tw:px-4">
    <div class="tw:mx-auto tw:w-full tw:max-w-3xl">
      <div class="tw:mb-6 tw:flex tw:justify-center">
        <BrandLogo class="tw:h-8" />
      </div>

      <div class="tw:rounded-xl tw:bg-card tw:p-6 tw:shadow-sm sm:tw:p-8">
        <!-- Loading -->
        <div v-if="loading" class="tw:flex tw:justify-center tw:py-12">
          <BaseSpinner />
        </div>

        <!-- Dead link -->
        <div v-else-if="error && !needsVerification && !record" class="tw:text-center tw:py-8">
          <IconAlertCircle :size="40" class="tw:mx-auto tw:mb-3 tw:text-secondary" />
          <p class="tw:text-lg tw:font-medium">{{ error }}</p>
          <p class="tw:mt-2 tw:text-sm tw:text-secondary">
            Links expire, and the person who shared this can withdraw it at any time. Ask them to
            send a new one.
          </p>
        </div>

        <!-- Code gate -->
        <div v-else-if="needsVerification" class="tw:mx-auto tw:max-w-sm tw:py-4">
          <div class="tw:mb-5 tw:text-center">
            <div
              class="tw:mx-auto tw:mb-3 tw:flex tw:size-12 tw:items-center tw:justify-center tw:rounded-full tw:bg-sidebar tw:text-primary"
            >
              <IconLock :size="22" />
            </div>
            <h1 class="tw:text-xl tw:font-semibold">A {{ label }} has been shared with you</h1>
            <p class="tw:mt-2 tw:text-sm tw:text-secondary">
              To open it, we’ll email a short code to
              <strong class="tw:text-on-main">{{ maskedEmail }}</strong
              >.
            </p>
          </div>

          <div v-if="!codeSent" class="tw:flex tw:flex-col tw:gap-3">
            <BaseButton :loading="sending" class="tw:w-full" @click="requestCode">
              <IconMail :size="16" class="tw:mr-1.5" />
              Email me a code
            </BaseButton>
          </div>

          <div v-else class="tw:flex tw:flex-col tw:gap-3">
            <BaseField label="Verification code">
              <BaseTextInput
                v-model="code"
                placeholder="6-digit code"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="6"
                @keyup.enter="verify"
              />
            </BaseField>
            <BaseButton :loading="verifying" :disabled="!code" class="tw:w-full" @click="verify">
              Open the {{ label }}
            </BaseButton>
            <button
              type="button"
              class="tw:text-xs tw:text-secondary tw:underline"
              :disabled="sending"
              @click="requestCode"
            >
              Send another code
            </button>
          </div>

          <p v-if="error" class="tw:mt-3 tw:text-center tw:text-sm tw:text-red-600">{{ error }}</p>
        </div>

        <!-- The record -->
        <div v-else-if="record">
          <div class="tw:mb-6 tw:border-b tw:border-input-border tw:pb-4">
            <BaseText color="secondary" class="tw:text-xs tw:uppercase tw:tracking-wide">
              {{ record.label }}
            </BaseText>
            <h1 class="tw:mt-1 tw:text-2xl tw:font-semibold">
              {{ record.reference }}
            </h1>
            <p v-if="record.title" class="tw:mt-1 tw:text-secondary">{{ record.title }}</p>
          </div>

          <div class="tw:flex tw:flex-col tw:gap-6">
            <section v-for="section in record.sections" :key="section.title">
              <h2
                class="tw:mb-2 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
              >
                {{ section.title }}
              </h2>
              <dl class="tw:grid tw:gap-x-6 tw:gap-y-3 sm:tw:grid-cols-2">
                <div v-for="item in section.items" :key="item.label">
                  <dt class="tw:text-xs tw:text-secondary">{{ item.label }}</dt>
                  <dd class="tw:mt-0.5 tw:text-sm tw:whitespace-pre-line">{{ item.value }}</dd>
                </div>
              </dl>
            </section>
          </div>

          <p
            class="tw:mt-8 tw:border-t tw:border-input-border tw:pt-4 tw:text-xs tw:text-secondary"
          >
            This is a shared view of a single record. It shows a summary, not the full internal
            record, and access can be withdrawn at any time.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
