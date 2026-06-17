<script setup>
// Form field hint. Pass an `id` (falls through to this <p>) and reference it
// from the control's `aria-describedby`. Style sourced from the token map.
import { TEXT_VARIANT, TEXT_COLOR } from './typography.js'
const v = TEXT_VARIANT.helper
</script>

<template>
  <p :class="[v.size, v.weight, TEXT_COLOR[v.color]]">
    <slot />
  </p>
</template>
