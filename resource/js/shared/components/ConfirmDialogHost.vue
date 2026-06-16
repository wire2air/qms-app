<script setup>
/**
 * ConfirmDialogHost — the single global renderer for useConfirm().
 * Mount once near the app root (see App.vue). Don't use directly in features;
 * call `const confirm = useConfirm()` instead.
 */
import { useConfirmState } from '@shared/composables/useConfirm.js'

const { state, resolveWith } = useConfirmState()

function onOk() {
  resolveWith(true)
}

// Cancel button OR backdrop/esc/X dismissal — all resolve false.
function onDismiss(open) {
  if (!open) resolveWith(false)
}
</script>

<template>
  <ConfirmDialog
    :modelValue="state.open"
    :title="state.options.title"
    :message="state.options.message"
    :okLabel="state.options.okLabel"
    :cancelLabel="state.options.cancelLabel"
    :okVariant="state.options.okVariant"
    :persistent="state.options.persistent"
    @ok="onOk"
    @cancel="resolveWith(false)"
    @update:modelValue="onDismiss"
  />
</template>
