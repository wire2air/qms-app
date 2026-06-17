<script setup>
/** Clone a global AQL standard into an editable tenant copy. */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const props = defineProps({ sourceStandardId: { type: String, default: null }, sourceName: { type: String, default: '' } })
const emit = defineEmits(['cloned'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)
const name = ref('')

watch(show, (v) => {
  if (v) name.value = props.sourceName ? `${props.sourceName} (custom)` : ''
})

async function onClone() {
  if (!name.value.trim() || saving.value) return
  saving.value = true
  try {
    const { standard } = await post(
      `/v1/services/qcInspection/samplingStandards/${props.sourceStandardId}/clone`,
      { name: name.value.trim() },
    )
    toast.success('Custom AQL standard created')
    show.value = false
    emit('cloned', standard.id)
  } catch (err) {
    toast.error(err?.message || 'Clone failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Clone AQL standard" :persistent="true" size="md">
    <div class="tw:p-4 tw:space-y-3">
      <p class="tw:text-sm tw:text-secondary">
        Creates an editable copy of <strong>{{ sourceName }}</strong> for your company. The original
        standard stays unchanged; you can adjust the cloned sample sizes / accept-reject values.
      </p>
      <BaseField v-slot="{ id: fieldId }" label="Custom standard name" required>
        <BaseTextInput :id="fieldId" v-model="name" placeholder="e.g. Acme Tightened Z1.4" />
      </BaseField>
    </div>
    <template #footer>
      <BaseDialogFooter
        submitLabel="Clone"
        :loading="saving"
        :disabled="!name.trim()"
        @cancel="show = false"
        @submit="onClone"
      />
    </template>
  </BaseDialog>
</template>
