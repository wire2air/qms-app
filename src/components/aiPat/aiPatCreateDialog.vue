<script setup>
import { IconRobot, IconAlertTriangle, IconCopy, IconEye, IconEyeOff } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { useToast } from '@shared/composables/useToast.js'

const show = defineModel({ type: Boolean, default: false })

const toast = useToast()

const form = ref({
  name: '',
  expiresAt: null,
})

const nameError = ref(null)
const loading = ref(false)
const createdToken = ref(null)
// Token defaults to masked (type=password) on display. The eye-icon toggle
// reveals on demand. Reset to masked whenever the dialog reopens so a second
// token doesn't inherit the previous reveal state.
const revealed = ref(false)

async function handleSubmit() {
  nameError.value = null
  if (!form.value.name.trim() || form.value.name.trim().length < 3) {
    nameError.value = 'Name must be at least 3 characters'
    return
  }

  loading.value = true
  try {
    const result = await post('/v1/services/ai/pats', {
      name: form.value.name.trim(),
      expiresAt: form.value.expiresAt || null,
    })

    if (result?.raw) {
      createdToken.value = result.raw
    } else {
      resetAndClose()
      toast.notify({ type: 'positive', message: 'Token created' })
    }
  } finally {
    loading.value = false
  }
}

function handleCopy() {
  if (createdToken.value) {
    navigator.clipboard.writeText(createdToken.value)
    toast.notify({ type: 'positive', message: 'Token copied to clipboard' })
  }
}

function resetAndClose() {
  form.value = { name: '', expiresAt: null }
  createdToken.value = null
  nameError.value = null
  revealed.value = false
  show.value = false
}

function handleDialogClose() {
  createdToken.value = null
  revealed.value = false
}
</script>

<template>
  <BaseDialog v-model="show" @close="handleDialogClose">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconRobot :size="24" />
        </div>
        <span class="tw:text-2xl tw:font-bold tw:text-on-main">
          {{ createdToken ? 'Token Created' : 'Create API Token' }}
        </span>
      </div>
    </template>

    <!-- Create form -->
    <template v-if="!createdToken">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:text-sm tw:text-secondary tw:leading-relaxed">
          Generate a personal access token for an external AI client. The token will inherit your
          identity and permissions — only you can manage it.
        </div>

        <div class="tw:flex tw:flex-col tw:gap-4">
          <BaseTextInput
            v-model="form.name"
            label="Token Name"
            placeholder="e.g., Claude Desktop — Laptop"
            :error="nameError"
            autofocus
          />
          <BaseField label="Expires At" hint="Leave empty for no expiration">
            <BaseDatePicker v-model="form.expiresAt" />
          </BaseField>
        </div>
      </div>
    </template>

    <!-- Token created -->
    <template v-else>
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div
          class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:p-3 tw:flex tw:items-start tw:gap-2"
        >
          <IconAlertTriangle :size="20" class="tw:text-amber-600 tw:mt-0.5 tw:shrink-0" />
          <div class="tw:text-sm tw:text-amber-800">
            Copy this token now. You won't be able to see it again.
          </div>
        </div>

        <div class="tw:flex tw:items-center tw:gap-2">
          <BaseTextInput
            :modelValue="createdToken"
            readonly
            :type="revealed ? 'text' : 'password'"
            class="tw:flex-1 tw:font-mono"
          />
          <button
            class="tw:rounded-lg tw:border tw:border-divider tw:p-2 tw:hover:bg-main-hover tw:transition-colors"
            :title="revealed ? 'Hide' : 'Reveal'"
            @click="revealed = !revealed"
          >
            <IconEye v-if="!revealed" :size="18" class="tw:text-secondary" />
            <IconEyeOff v-else :size="18" class="tw:text-secondary" />
          </button>
          <button
            class="tw:rounded-lg tw:border tw:border-divider tw:p-2 tw:hover:bg-main-hover tw:transition-colors"
            title="Copy to clipboard"
            @click="handleCopy"
          >
            <IconCopy :size="18" class="tw:text-primary" />
          </button>
        </div>

        <div class="tw:text-xs tw:text-secondary">
          Configure your MCP client to send this as the
          <code class="tw:font-mono tw:bg-main-hover tw:px-1 tw:rounded">Authorization</code> header
          when calling
          <code class="tw:font-mono tw:bg-main-hover tw:px-1 tw:rounded">/v1/services/ai/mcp</code>.
        </div>
      </div>
    </template>

    <template #footer>
      <template v-if="!createdToken">
        <BaseButton variant="outline" @click="resetAndClose">Cancel</BaseButton>
        <BaseButton :disabled="loading" @click="handleSubmit">
          {{ loading ? 'Creating…' : 'Create Token' }}
        </BaseButton>
      </template>
      <template v-else>
        <BaseButton @click="resetAndClose">Done</BaseButton>
      </template>
    </template>
  </BaseDialog>
</template>
