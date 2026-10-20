<script setup>
import { IconShieldCheck } from '@tabler/icons-vue'

/** USER / LEAD / VISITOR chip for a chat's person, with a verified mark. */
const props = defineProps({
  kind: { type: String, default: 'VISITOR' },
  verified: { type: Boolean, default: false },
})
const LABEL = { USER: 'User', LEAD: 'Lead', VISITOR: 'Visitor' }
const CLASS = {
  USER: 'tw:bg-green-100 tw:text-green-800',
  LEAD: 'tw:bg-blue-100 tw:text-blue-800',
  VISITOR: 'tw:bg-gray-100 tw:text-secondary',
}
const label = computed(() => LABEL[props.kind] || props.kind)
</script>

<template>
  <span
    class="tw:inline-flex tw:items-center tw:gap-1 tw:rounded tw:px-1.5 tw:py-0.5 tw:text-micro tw:font-semibold"
    :class="CLASS[kind] || CLASS.VISITOR"
    :title="verified ? 'Identity verified by the host site' : ''"
  >
    {{ label }}
    <IconShieldCheck v-if="verified" :size="11" />
  </span>
</template>
