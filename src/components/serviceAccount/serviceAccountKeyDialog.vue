<script setup>
import { IconKey, IconAlertTriangle, IconCopy, IconEye, IconEyeOff } from '@tabler/icons-vue'
import { issueServiceAccountKey } from '@/api/serviceAccounts.js'
import { useToast } from '@shared/composables/useToast.js'

const props = defineProps({
  accountId: { type: String, required: true },
})

const emit = defineEmits(['issued'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()

const form = ref({ name: '', expiresAt: null })
const nameError = ref(null)
const loading = ref(false)
const secret = ref(null)
// Masked by default; the eye toggle reveals on demand. Reset on every open so a
// second key never inherits the previous reveal state.
const revealed = ref(false)

async function handleSubmit() {
  nameError.value = null
  const name = form.value.name.trim()
  if (name.length < 3) {
    nameError.value = 'Name must be at least 3 characters'
    return
  }

  loading.value = true
  try {
    const result = await issueServiceAccountKey(props.accountId, {
      name,
      expiresAt: form.value.expiresAt || null,
    })
    secret.value = result?.secret ?? null
    emit('issued')
  } finally {
    loading.value = false
  }
}

function handleCopy() {
  if (!secret.value) return
  navigator.clipboard.writeText(secret.value)
  toast.notify({ type: 'positive', message: 'Key copied to clipboard' })
}

function resetAndClose() {
  form.value = { name: '', expiresAt: null }
  nameError.value = null
  secret.value = null
  revealed.value = false
  show.value = false
}

function handleDialogClose() {
  secret.value = null
  revealed.value = false
}
</script>

<template>
  <BaseDialog v-model="show" @close="handleDialogClose">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-xl tw:bg-primary/10 tw:text-primary"
        >
          <IconKey :size="24" />
        </div>
        <span class="tw:text-2xl tw:font-bold tw:text-on-main">
          {{ secret ? 'Key Issued' : 'Issue API Key' }}
        </span>
      </div>
    </template>

    <template v-if="!secret">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:text-sm tw:leading-relaxed tw:text-secondary">
          The key carries this service account's roles — not yours. Name it after the system that
          will use it, so a key found in a log can be traced back to one place.
        </div>

        <BaseTextInput
          v-model="form.name"
          label="Key Name"
          placeholder="e.g., SAP production connector"
          :error="nameError"
          autofocus
        />

        <BaseField label="Expires At" hint="Leave empty for no expiration">
          <BaseDateField v-model="form.expiresAt" mode="date" />
        </BaseField>
      </div>
    </template>

    <template v-else>
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div
          class="tw:flex tw:items-start tw:gap-2 tw:rounded-lg tw:border tw:border-amber-200 tw:bg-amber-50 tw:p-3"
        >
          <IconAlertTriangle :size="20" class="tw:mt-0.5 tw:shrink-0 tw:text-amber-600" />
          <div class="tw:text-sm tw:text-amber-800">
            Copy this key now. Only its hash is stored, so it cannot be shown again — if you lose
            it, revoke it and issue another.
          </div>
        </div>

        <div class="tw:flex tw:items-center tw:gap-2">
          <BaseTextInput
            :modelValue="secret"
            readonly
            :type="revealed ? 'text' : 'password'"
            class="tw:flex-1"
          />
          <button
            class="tw:rounded-lg tw:border tw:border-divider tw:p-2 tw:transition-colors tw:hover:bg-main-hover"
            :title="revealed ? 'Hide' : 'Reveal'"
            :aria-label="revealed ? 'Hide key' : 'Reveal key'"
            @click="revealed = !revealed"
          >
            <IconEye v-if="!revealed" :size="18" class="tw:text-secondary" />
            <IconEyeOff v-else :size="18" class="tw:text-secondary" />
          </button>
          <button
            class="tw:rounded-lg tw:border tw:border-divider tw:p-2 tw:transition-colors tw:hover:bg-main-hover"
            title="Copy to clipboard"
            aria-label="Copy key to clipboard"
            @click="handleCopy"
          >
            <IconCopy :size="18" class="tw:text-primary" />
          </button>
        </div>

        <div class="tw:text-xs tw:text-secondary">
          Send it as
          <code class="tw:rounded tw:bg-main-hover tw:px-1">x-api-key</code>
          or
          <code class="tw:rounded tw:bg-main-hover tw:px-1">Authorization: Bearer …</code>
          on requests to <code class="tw:rounded tw:bg-main-hover tw:px-1">/v1/services/…</code>.
        </div>
      </div>
    </template>

    <template #footer>
      <template v-if="!secret">
        <BaseButton variant="outline" @click="resetAndClose">Cancel</BaseButton>
        <BaseButton :disabled="loading" @click="handleSubmit">
          {{ loading ? 'Issuing…' : 'Issue Key' }}
        </BaseButton>
      </template>
      <template v-else>
        <BaseButton @click="resetAndClose">Done</BaseButton>
      </template>
    </template>
  </BaseDialog>
</template>
