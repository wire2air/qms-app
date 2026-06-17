<script setup>
import { required, helpers } from '@vuelidate/validators'
import { useValidator } from '@shared/composables/validator.js'

defineProps({
  actionLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['confirm'])

const show = defineModel({ type: Boolean, default: false })

const form = ref({ comment: '' })

const rules = computed(() => ({
  comment: { required: helpers.withMessage('A comment is required', required) },
}))

const validator = useValidator(rules, form)

watch(show, (val) => {
  if (val) form.value.comment = ''
})

async function confirm() {
  const valid = await validator.value.$validate()
  if (!valid) return
  emit('confirm', form.value.comment)
  show.value = false
}
</script>

<template>
  <BaseDialog v-model="show" title="Request Changes" maxWidth="sm" persistent>
    <p class="tw:text-sm tw:text-secondary tw:mb-4">
      Please describe the changes you need before this step can be approved.
    </p>
    <BaseTextarea v-model="form.comment" placeholder="Comment (required)" />

    <template #footer>
      <BaseDialogFooter
        submitLabel="Request Changes"
        :loading="actionLoading"
        :disabled="actionLoading"
        @cancel="show = false"
        @submit="confirm"
      />
    </template>
  </BaseDialog>
</template>
