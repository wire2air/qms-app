<script setup>
import { IconLock, IconWorld, IconUserCheck } from '@tabler/icons-vue'
import { AUDIENCE_SHORT, AUDIENCE_HELP } from './kbAudience.js'

/** PUBLIC (help center), CUSTOMERS (signed-in product users) or AGENTS (desk only). */
const props = defineProps({ audience: { type: String, default: 'PUBLIC' } })
const STYLE = {
  PUBLIC: { icon: IconWorld, class: 'tw:bg-sky-100 tw:text-sky-800' },
  CUSTOMERS: { icon: IconUserCheck, class: 'tw:bg-violet-100 tw:text-violet-800' },
  AGENTS: { icon: IconLock, class: 'tw:bg-amber-100 tw:text-amber-800' },
}
const s = computed(() => STYLE[props.audience] || STYLE.PUBLIC)
</script>

<template>
  <BaseBadge size="sm" :class="s.class" :title="AUDIENCE_HELP[audience] || ''">
    <component :is="s.icon" :size="12" class="tw:mr-1" />
    {{ AUDIENCE_SHORT[audience] || audience }}
  </BaseBadge>
</template>
