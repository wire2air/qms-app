<script setup>
defineProps({
  source: { type: Object, required: true },
})

const SCHEME_MAP = {
  WEB: { class: 'tw:bg-sky-100 tw:text-sky-700' },
  EMAIL: { class: 'tw:bg-teal-100 tw:text-teal-700' },
  MANUAL: { class: 'tw:bg-gray-100 tw:text-gray-700' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(source.id).class">
    {{ source.name || source.id || '—' }}
  </BaseBadge>
</template>
