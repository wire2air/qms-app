<script setup>
/**
 * Clone (duplicate) an audit standard into a new one. Asks for a new per-tenant
 * code + name (pre-filled), POSTs to /auditStandards/:id/clone — which copies
 * the parent metadata + the source's clause list (hierarchy + guided-audit
 * content preserved) into a fresh v1.0 DRAFT — then opens the new standard.
 */
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // The source standard being cloned ({ id, code, name }).
  standard: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'cloned'])

const router = useRouter()
const toast = useToast()

const form = ref({ code: '', name: '' })
const saving = ref(false)

watch(
  () => props.modelValue,
  (open) => {
    if (!open || !props.standard) return
    const base = (props.standard.code || 'STD').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 90)
    form.value = {
      code: `${base}-COPY`,
      name: `Copy of ${props.standard.name || ''}`.trim(),
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

async function handleClone({ navigate }) {
  if (!props.standard?.id) return
  if (!form.value.name.trim()) {
    toast.warning('Name is required')
    return
  }
  if (!form.value.code.trim()) {
    toast.warning('Code is required')
    return
  }
  saving.value = true
  try {
    const result = await post(`/v1/services/auditStandards/${props.standard.id}/clone`, {
      code: form.value.code.trim(),
      name: form.value.name.trim(),
    })
    const standard = result?.standard
    toast.success(`Cloned to "${standard?.name}"`)
    emit('cloned', standard)
    close()
    if (navigate && standard?.id) {
      router.push(getCompanyPath(`/audits/standards/${standard.id}`))
    }
  } catch (e) {
    toast.error(e.message || 'Failed to clone audit standard')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog :modelValue="modelValue" title="Duplicate Audit Standard" maxWidth="lg" @update:modelValue="close">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <p class="tw:text-xs tw:text-secondary">
        Copies <strong>{{ standard?.name }}</strong> and all its clauses into a new standard as a
        v1.0 DRAFT. Give it a new code + name.
      </p>
      <BaseField v-slot="{ id: fieldId }" label="Name" required>
        <BaseTextInput :id="fieldId" v-model="form.name" placeholder="e.g. Copy of ISO 9001:2015" />
      </BaseField>
      <BaseField
        v-slot="{ id: fieldId }"
        label="Code"
        required
        hint="Per-tenant unique. Cannot be changed after creation."
      >
        <BaseTextInput :id="fieldId" v-model="form.code" placeholder="ISO_9001_2015-COPY" />
      </BaseField>
    </div>
    <template #footer>
      <BaseButton variant="outline" :disabled="saving" @click="close">Cancel</BaseButton>
      <BaseButton variant="outline" :loading="saving" :disabled="saving" @click="handleClone({ navigate: false })">
        Duplicate
      </BaseButton>
      <BaseButton variant="primary" :loading="saving" :disabled="saving" @click="handleClone({ navigate: true })">
        Duplicate &amp; open
      </BaseButton>
    </template>
  </BaseDialog>
</template>
