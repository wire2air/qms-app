<script setup>
import { IconKey, IconAlertTriangle, IconCopy } from '@tabler/icons-vue'
import { post } from '@/api'
import { useToast } from '@shared/composables/useToast.js'

const show = defineModel({ type: Boolean, default: false })

const toast = useToast()

const form = ref({
  name: '',
  label: '',
  expiresAt: null,
})

const nameError = ref(null)

const loading = ref(false)
const createdKey = ref(null)

async function handleSubmit() {
  nameError.value = null
  if (!form.value.name.trim()) {
    nameError.value = 'Name is required'
    return
  }

  loading.value = true
  try {
    const result = await post('/v1/services/api-keys', {
      name: form.value.name.trim(),
      label: form.value.label.trim() || null,
      expiresAt: form.value.expiresAt || null,
    })

    if (result?.key) {
      createdKey.value = result.key
    } else {
      resetAndClose()
      toast.notify({ type: 'positive', message: 'API key created successfully' })
    }
  } finally {
    loading.value = false
  }
}

function handleCopyKey() {
  if (createdKey.value) {
    navigator.clipboard.writeText(createdKey.value)
    toast.notify({ type: 'positive', message: 'API key copied to clipboard' })
  }
}

function resetAndClose() {
  form.value = { name: '', label: '', expiresAt: null }
  createdKey.value = null
  nameError.value = null
  show.value = false
}
</script>

<template>
  <BaseDialog v-model="show" @close="createdKey = null">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconKey :size="24" />
        </div>
        <span class="tw:text-2xl tw:font-bold tw:text-on-main">
          {{ createdKey ? 'API Key Created' : 'Create API Key' }}
        </span>
      </div>
    </template>

    <!-- Create Form -->
    <template v-if="!createdKey">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:text-sm tw:text-secondary tw:leading-relaxed">
          Create a new API key for programmatic access to your company data.
        </div>

        <div class="tw:flex tw:flex-col tw:gap-4">
          <BaseTextInput
            v-model="form.name"
            label="Name"
            placeholder="e.g., CI/CD Pipeline"
            :error="nameError"
            autofocus
          />
          <BaseTextInput
            v-model="form.label"
            label="Label"
            placeholder="e.g., Production deployment key"
          />
          <BaseField label="Expires At" hint="Leave empty for no expiration">
            <BaseDateField v-model="form.expiresAt" mode="date" />
          </BaseField>
        </div>
      </div>
    </template>

    <!-- Key Created Success -->
    <template v-else>
      <div class="tw:flex tw:flex-col tw:gap-4">
        <div
          class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:p-3 tw:flex tw:items-start tw:gap-2"
        >
          <IconAlertTriangle :size="20" class="tw:text-amber-600 tw:mt-0.5 tw:shrink-0" />
          <div class="tw:text-sm tw:text-amber-800">
            Copy this key now. You won't be able to see it again.
          </div>
        </div>

        <div class="tw:flex tw:items-center tw:gap-2">
          <BaseTextInput :modelValue="createdKey" readonly class="tw:flex-1 " />
          <button
            class="tw:rounded-lg tw:border tw:border-divider tw:p-2 tw:hover:bg-main-hover tw:transition-colors"
            title="Copy to clipboard"
            @click="handleCopyKey"
          >
            <IconCopy :size="18" class="tw:text-primary" />
          </button>
        </div>
      </div>
    </template>

    <template #footer>
      <template v-if="!createdKey">
        <BaseButton variant="outline" @click="resetAndClose">Cancel</BaseButton>
        <BaseButton :disabled="loading" @click="handleSubmit">
          {{ loading ? 'Creating...' : 'Create Key' }}
        </BaseButton>
      </template>
      <template v-else>
        <BaseButton @click="resetAndClose">Done</BaseButton>
      </template>
    </template>
  </BaseDialog>
</template>
