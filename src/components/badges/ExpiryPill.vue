<script setup>
/**
 * Small "Expires in N days" / "Expired" pill driven by a date prop.
 *
 * The bands are NOT hand-picked. They come from `reminderWindows` — the same
 * day list the cron uses (worker/tasks/send_supplier_certificate_expiry_notification.js,
 * REMINDER_WINDOWS_DAYS = [90, 30, 0]) — so the pill cannot claim a
 * certificate is fine on a day the system emails a warning about it. The
 * arithmetic and that invariant live in certificateExpiry.js, which is unit
 * tested; this file is colour only.
 *
 *   expired → red     lapsed. The cron stops emailing past day 0, so the pill
 *                     is the ONLY signal here — loudest on purpose.
 *   due     → orange  inside the innermost window (day 0): emailing today.
 *   warning → amber   inside the second window (<= 30 days).
 *   notice  → yellow  inside the outermost window (<= 90 days).
 *   ok      → green   beyond every window.
 *   none    → grey    no expiry recorded.
 *
 * The helper module sits under components/suppliers/ because the windows it
 * mirrors are the supplier-certificate cron's. If a second surface (document
 * review windows, training recertification) ever needs a different schedule,
 * it passes its own `reminderWindows` — the pill itself is generic.
 */
import { REMINDER_WINDOWS_DAYS, describeExpiry } from '@/components/suppliers/certificateExpiry.js'

const props = defineProps({
  expiresAt: { type: [Object, String, Date, null], default: null },
  // Day offsets on which a reminder is sent. Defaults to the supplier
  // certificate schedule; override for a surface with its own cadence.
  reminderWindows: { type: Array, default: () => REMINDER_WINDOWS_DAYS },
})

const expiry = computed(() => describeExpiry(props.expiresAt, { windows: props.reminderWindows }))

const CLASS_MAP = {
  none: 'tw:bg-gray-100 tw:text-gray-600',
  expired: 'tw:bg-red-100 tw:text-red-700',
  due: 'tw:bg-orange-100 tw:text-orange-700',
  warning: 'tw:bg-amber-100 tw:text-amber-700',
  notice: 'tw:bg-yellow-100 tw:text-yellow-700',
  ok: 'tw:bg-green-100 tw:text-green-700',
}

const className = computed(() => CLASS_MAP[expiry.value.bucket] || CLASS_MAP.none)

// Spelled out on hover: the pill is compact ("Expires in 45d") and the exact
// date plus "a reminder goes out today" is the part people act on.
const title = computed(() => {
  const parts = [expiry.value.label]
  if (props.expiresAt?.formatDate) parts.push(props.expiresAt.formatDate('date'))
  if (expiry.value.notifiesToday) parts.push('a renewal reminder is sent today')
  return parts.join(' · ')
})
</script>

<template>
  <span
    class="tw:inline-flex tw:items-center tw:text-xs tw:font-medium tw:rounded-md tw:border tw:border-current/20 tw:px-2 tw:py-0.5 tw:whitespace-nowrap"
    :class="className"
    :title="title"
  >
    {{ expiry.label }}
  </span>
</template>
