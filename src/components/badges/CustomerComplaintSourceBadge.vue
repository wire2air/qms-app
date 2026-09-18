<script setup>
defineProps({
  source: {
    type: Object,
    required: true,
  },
})

const SCHEME_MAP = {
  WEB: { class: 'tw:bg-sky-100 tw:text-sky-700' },
  WEB_FORM: { class: 'tw:bg-indigo-100 tw:text-indigo-700' },
  EMAIL: { class: 'tw:bg-violet-100 tw:text-violet-700' },
  PHONE: { class: 'tw:bg-teal-100 tw:text-teal-700' },
  OTHER: { class: 'tw:bg-gray-100 tw:text-gray-600' },
}

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(source.id).class">
    {{ source.name || source.id || '—' }}
  </BaseBadge>
</template>
