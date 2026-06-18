<script setup>
defineProps({
  title: {
    type: String,
    default: null,
  },
  message: {
    type: String,
    default: null,
  },
  cancel: {
    type: Boolean,
    default: true,
  },
  persistent: {
    type: Boolean,
    default: false,
  },
  okLabel: {
    type: String,
    default: 'Confirm',
  },
  cancelLabel: {
    type: String,
    default: 'Cancel',
  },
  // Visual emphasis of the confirm button. Use 'danger' for destructive actions.
  okVariant: {
    type: String,
    default: 'primary',
  },
})

const emit = defineEmits(['ok', 'cancel'])

const isOpen = defineModel({
  type: Boolean,
  default: false,
})

function handleOk() {
  emit('ok')
  isOpen.value = false
}

function handleCancel() {
  emit('cancel')
  isOpen.value = false
}
</script>

<template>
  <BaseDialog v-model="isOpen" :title="title" :persistent="persistent" maxWidth="sm">
    <p v-if="message" class="tw:text-sm tw:text-secondary">{{ message }}</p>
    <slot />

    <template #footer>
      <BaseButton v-if="cancel" variant="outline" @click="handleCancel">
        {{ cancelLabel }}
      </BaseButton>
      <BaseButton :variant="okVariant" @click="handleOk">
        {{ okLabel }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
