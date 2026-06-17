<script setup>
// Form field error. `role="alert"` announces it to screen readers; pass an
// `id` (falls through to this <p>) and wire it to the control's
// `aria-describedby` + `aria-invalid`. Style sourced from the token map.
import { TEXT_VARIANT, TEXT_COLOR } from './typography.js'
const v = TEXT_VARIANT.error
</script>

<template>
  <p role="alert" :class="[v.size, v.weight, TEXT_COLOR[v.color]]">
    <slot />
  </p>
</template>
