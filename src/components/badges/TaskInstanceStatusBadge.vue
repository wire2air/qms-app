<script setup>
const props = defineProps({
  status: { type: Object, required: true },
  showDot: { type: Boolean, default: false },
  hideLabel: { type: Boolean, default: false },
  module: { type: String, default: null },
})

const SCHEME_MAP = {
  APPROVED: { class: 'tw:bg-green-100 tw:text-green-700' },
  RESOLVED: { class: 'tw:bg-emerald-100 tw:text-emerald-700' },
  REJECTED: { class: 'tw:bg-red-100 tw:text-red-700' },
  CHANGES_REQUESTED: { class: 'tw:bg-orange-100 tw:text-orange-700' },
  PENDING: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  IN_PROGRESS: { class: 'tw:bg-amber-100 tw:text-amber-700' },
  ASSIGNED: { class: 'tw:bg-blue-100 tw:text-blue-700' },
  CANCELLED: { class: 'tw:bg-gray-100 tw:text-gray-600' },
  REASSIGNED: { class: 'tw:bg-purple-100 tw:text-purple-700' },
  SENT_BACK: { class: 'tw:bg-orange-100 tw:text-orange-700' },
  FORM_SUBMITTED: { class: 'tw:bg-sky-100 tw:text-sky-700' },
  SUPERSEDED: { class: 'tw:bg-slate-100 tw:text-slate-600' },
}

const name = computed(() => {
  if (!props.status) return '—'
  if (props.module === 'Nonconformance') {
    return props.status.name === 'Approved'
      ? 'Completed'
      : props.status.name || props.status.id || '—'
  }
  return props.status.name || props.status.id || '—'
})

const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(status?.id).class" :showDot="showDot">
    <template v-if="!hideLabel">{{ name }}</template>
  </BaseBadge>
</template>
