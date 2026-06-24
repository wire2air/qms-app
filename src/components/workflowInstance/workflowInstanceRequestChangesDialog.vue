<script setup>
import { required } from '@shared/components/form/validators.js'

defineProps({
  actionLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['confirm'])

const show = defineModel({ type: Boolean, default: false })

const formRef = ref(null)
const saveError = ref('')
const form = ref({ comment: '' })

watch(show, (val) => {
  if (val) {
    form.value.comment = ''
    saveError.value = ''
  }
})

async function onSubmit() {
  saveError.value = ''
  try {
    emit('confirm', form.value.comment)
    show.value = false
  } catch (err) {
    saveError.value = err?.message || 'Failed to request changes'
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Request Changes" maxWidth="sm" persistent>
    <p class="tw:text-sm tw:text-secondary tw:mb-4">
      Please describe the changes you need before this step can be approved.
    </p>

    <BaseForm ref="formRef" hideFooter @submit="onSubmit">
      <BaseField
        label="Comment"
        required
        :value="form.comment"
        :rules="[required('A comment is required')]"
      >
        <template #default="field">
          <BaseTextarea v-bind="field" v-model="form.comment" placeholder="Comment (required)" />
        </template>
      </BaseField>
    </BaseForm>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Request Changes"
        :loading="actionLoading"
        :disabled="actionLoading"
        :error="saveError"
        @cancel="show = false"
        @submit="formRef?.submit()"
      />
    </template>
  </BaseDialog>
</template>
