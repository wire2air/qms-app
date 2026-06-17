<script setup>
import { Switch } from '@headlessui/vue'

defineProps({
  disabled: {
    type: Boolean,
    default: false,
  },
  // Accessible name announced to screen readers.
  label: {
    type: String,
    default: 'Toggle setting',
  },
})

const enabled = defineModel({
  type: Boolean,
  default: false,
})
</script>

<template>
  <Switch
    v-model="enabled"
    :class="enabled ? 'tw:bg-primary' : 'tw:bg-primary/40'"
    :disabled="disabled"
    class="tw:inline-flex tw:h-6 tw:w-11 tw:shrink-0 tw:cursor-pointer tw:rounded-full tw:border-2 tw:border-transparent tw:transition-colors tw:duration-200 tw:ease-in-out tw:focus:outline-none tw:focus-visible:ring-2 tw:focus-visible:ring-primary/40 tw:focus-visible:ring-offset-2 tw:disabled:opacity-60 tw:disabled:cursor-not-allowed"
  >
    <span class="tw:sr-only">{{ label }}</span>
    <span
      aria-hidden="true"
      :class="enabled ? 'tw:translate-x-5' : 'tw:translate-x-0'"
      class="tw:pointer-events-none tw:inline-block tw:h-5 tw:w-5 tw:transform tw:rounded-full tw:bg-white tw:shadow-lg tw:ring-0 tw:transition tw:duration-200 tw:ease-in-out"
    />
  </Switch>
</template>
