<script setup>
import { IconRobot, IconInfoCircle } from '@tabler/icons-vue'
import { createServiceAccount } from '@/api/serviceAccounts.js'

const emit = defineEmits(['created'])
const show = defineModel({ type: Boolean, default: false })
const form = ref({ name: '', description: '', roleIds: [] })
const nameError = ref(null)
const loading = ref(false)

async function handleSubmit() {
  nameError.value = null
  const name = form.value.name.trim()
  if (name.length < 3) {
    nameError.value = 'Name must be at least 3 characters'
    return
  }

  loading.value = true
  try {
    await createServiceAccount({
      name,
      description: form.value.description.trim() || null,
      roleIds: form.value.roleIds,
    })
    emit('created')
    resetAndClose()
  } finally {
    loading.value = false
  }
}

function resetAndClose() {
  form.value = { name: '', description: '', roleIds: [] }
  nameError.value = null
  show.value = false
}
</script>

<template>
  <BaseDialog v-model="show">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-xl tw:bg-primary/10 tw:text-primary"
        >
          <IconRobot :size="24" />
        </div>
        <span class="tw:text-2xl tw:font-bold tw:text-on-main">New Service Account</span>
      </div>
    </template>

    <div class="tw:flex tw:flex-col tw:gap-4">
      <div class="tw:text-sm tw:leading-relaxed tw:text-secondary">
        A machine identity for one integration. It cannot sign in — it has no password and no
        email — and it acts only through the API keys you issue against it.
      </div>

      <BaseTextInput
        v-model="form.name"
        label="Name"
        placeholder="e.g., SAP Integration"
        :error="nameError"
        autofocus
      />

      <BaseField label="Description" hint="What this integration does, for whoever finds it later">
        <BaseTextarea v-model="form.description" placeholder="e.g., Nightly supplier master sync" />
      </BaseField>

      <BaseField
        label="Roles"
        hint="What the integration is allowed to do. Grant the least it needs."
      >
        <RoleSelectMenu v-model="form.roleIds" multiple />
      </BaseField>

      <div
        class="tw:flex tw:items-start tw:gap-2 tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover tw:p-3"
      >
        <IconInfoCircle :size="20" class="tw:mt-0.5 tw:shrink-0 tw:text-secondary" />
        <div class="tw:text-caption tw:text-secondary">
          You can only grant roles whose permissions you hold yourself, at the same scope or
          narrower. Anything wider is refused, so a service account can never be used to give
          yourself access you were not granted.
        </div>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" @click="resetAndClose">Cancel</BaseButton>
      <BaseButton :disabled="loading" @click="handleSubmit">
        {{ loading ? 'Creating…' : 'Create' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
