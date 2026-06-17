<script setup>
// Small secondary/meta text (timestamps, counts). Sources its style from the
// shared token map (caption variant); renders a single <span> so consumer
// attrs (class, title, …) fall through reliably.
import { TEXT_VARIANT, TEXT_COLOR } from './typography.js'
const v = TEXT_VARIANT.caption
</script>

<template>
  <span :class="[v.size, v.weight, TEXT_COLOR[v.color]]">
    <slot />
  </span>
</template>
