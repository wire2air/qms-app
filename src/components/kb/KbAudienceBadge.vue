<script setup>
import { IconLock, IconWorld } from '@tabler/icons-vue'

/** PUBLIC (help center) or AGENTS (desk only). */
const props = defineProps({ audience: { type: String, default: 'PUBLIC' } })
const agents = computed(() => props.audience === 'AGENTS')
</script>

<template>
  <BaseBadge
    size="sm"
    :class="agents ? 'tw:bg-amber-100 tw:text-amber-800' : 'tw:bg-sky-100 tw:text-sky-800'"
    :title="
      agents ? 'Only agents see it, in the desk' : 'Shown on the public help center once published'
    "
  >
    <component :is="agents ? IconLock : IconWorld" :size="12" class="tw:mr-1" />
    {{ agents ? 'Agents only' : 'Public' }}
  </BaseBadge>
</template>
