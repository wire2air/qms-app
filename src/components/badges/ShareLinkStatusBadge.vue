<script setup>
defineProps({
  status: { type: Object, required: true },
})

/**
 * A share link is in exactly one of three states, and they are not equally
 * reassuring: ACTIVE is a live credential someone outside holds right now,
 * EXPIRED lapsed on its own, WITHDRAWN was taken away deliberately. Only the
 * first is something to act on, so only the first carries colour.
 */
const SCHEME_MAP = {
  ACTIVE: { class: 'tw:bg-green-100 tw:text-green-700' },
  EXPIRED: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  WITHDRAWN: { class: 'tw:bg-gray-100 tw:text-gray-600' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class">
    {{ status?.name || status?.id || '—' }}
  </BaseBadge>
</template>
