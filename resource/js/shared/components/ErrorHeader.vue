<script setup>
const props = defineProps({
  errorTitle: {
    type: String,
    default: '',
  },
  errorDescription: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <div class="text-center">
    <!-- 👉 Title and subtitle -->
    <h4 class="tw:text-2xl tw:font-semibold tw:mb-3">
      {{ props.errorTitle }}
    </h4>
    <p>{{ props.errorDescription }}</p>
  </div>
</template>
