<script setup>
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { getCompanyPath } from '@/utils/routeHelpers'

const props = defineProps({
  templateId: { type: String, required: true },
  suggestedName: { type: String, default: '' },
})
const emit = defineEmits(['promoted'])
const open = defineModel({ type: Boolean, default: false })
const router = useRouter()

const displayName = ref('')
const internalName = ref('')
const saving = ref(false)
const error = ref('')

function toKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

watch(open, (v) => {
  if (v) {
    displayName.value = props.suggestedName || ''
    internalName.value = toKey(props.suggestedName)
    error.value = ''
  }
})

async function promote() {
  if (saving.value) return
  error.value = ''
  saving.value = true
  try {
    await post('/v1/services/form-modules/promote', {
      templateId: props.templateId,
      internalName: internalName.value,
      displayName: displayName.value,
    })
    open.value = false
    emit('promoted')
    router.push(getCompanyPath(`/m/${internalName.value}`))
  } catch (e) {
    error.value = e?.message || 'Failed to promote'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Promote to Module">
    <div class="tw:flex tw:flex-col tw:gap-3">
      <p class="tw:text-sm tw:text-secondary">
        Turn this form into a first-class module with its own left-nav entry, record list, and
        Draft → Open → Closed lifecycle.
      </p>
      <BaseTextInput v-model="displayName" label="Module name" placeholder="Deviation" />
      <BaseTextInput
        v-model="internalName"
        label="Internal key"
        placeholder="deviation"
        instructions="Lowercase letters, digits, underscores. 2–40 chars. Immutable once set."
      />
      <div v-if="error" class="tw:text-sm tw:text-bad">{{ error }}</div>
    </div>
    <template #footer>
      <BaseButton variant="outline" @click="open = false">Cancel</BaseButton>
      <BaseButton variant="primary" :loading="saving" :disabled="!internalName" @click="promote">
        Promote
      </BaseButton>
    </template>
  </BaseDialog>
</template>
