<script setup>
/**
 * Small "Expires in N days" / "Expired" pill driven by a date prop.
 * Colour bands:
 *   already expired  → red
 *   ≤ 30 days        → amber
 *   ≤ 90 days        → yellow
 *   > 90 days        → green (low-key)
 *   null / no date   → neutral grey "no expiry"
 *
 * Used today by the supplier cert list; trivially reusable for any
 * other expiring-thing surface (document review windows, training
 * recertification dates, etc.).
 */
import { DateTime } from 'luxon'

const props = defineProps({
  expiresAt: { type: [Object, String, Date, null], default: null },
})

const dt = computed(() => {
  if (!props.expiresAt) return null
  if (props.expiresAt instanceof DateTime) return props.expiresAt
  return DateTime.fromJSDate(new Date(props.expiresAt))
})

const daysUntilExpiry = computed(() => {
  if (!dt.value) return null
  return Math.floor(dt.value.diff(DateTime.now(), 'days').days)
})

const label = computed(() => {
  if (daysUntilExpiry.value === null) return 'No expiry'
  const d = daysUntilExpiry.value
  if (d < 0) return `Expired ${-d}d ago`
  if (d === 0) return 'Expires today'
  if (d === 1) return 'Expires tomorrow'
  return `Expires in ${d}d`
})

const className = computed(() => {
  if (daysUntilExpiry.value === null) {
    return 'tw:bg-gray-100 tw:text-gray-600'
  }
  const d = daysUntilExpiry.value
  if (d < 0) return 'tw:bg-red-100 tw:text-red-700'
  if (d <= 30) return 'tw:bg-amber-100 tw:text-amber-700'
  if (d <= 90) return 'tw:bg-yellow-100 tw:text-yellow-700'
  return 'tw:bg-green-100 tw:text-green-700'
})
</script>

<template>
  <span
    class="tw:inline-flex tw:items-center tw:text-xs tw:font-medium tw:rounded-md tw:border tw:border-current/20 tw:px-2 tw:py-0.5 tw:whitespace-nowrap"
    :class="className"
  >
    {{ label }}
  </span>
</template>
