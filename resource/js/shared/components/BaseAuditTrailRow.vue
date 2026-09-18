<script setup>
/**
 * BaseAuditTrailRow — the small "by {actor} · {date}" actor/timestamp line shown
 * under versions, flags, comments, and revisions across detail pages (~15–20
 * sites). Replaces the copy-pasted
 *   <div class="tw:text-xs tw:text-secondary tw:flex tw:items-center tw:gap-1">
 *     <span>by</span><UserBadgeById :userId="…" /><span>·</span><span>{{ fmt(date) }}</span>
 *   </div>
 *
 * The actor is supplied via the default slot (so the consumer keeps using
 * UserBadgeById / UserAvatarById — this stays decoupled from the user feature),
 * or via the `actor` string prop for plain-text actors. The date is a luxon
 * DateTime formatted through the project-wide `dt.formatDate()` (CLAUDE.md #10),
 * never an ad-hoc `.toFormat()`.
 *
 *   <BaseAuditTrailRow :date="rev.authoredAt"><UserBadgeById :userId="rev.authorUserId" /></BaseAuditTrailRow>
 *   <BaseAuditTrailRow prefix="Voided by" :date="record.voidedAt"><UserBadgeById :userId="record.voidedByUserId" /></BaseAuditTrailRow>
 */
const props = defineProps({
  // Plain-text actor; used only when the default (actor) slot is empty.
  actor: { type: String, default: '' },
  // Leading word(s): "by" (default), "Voided by", "Created by", …
  prefix: { type: String, default: 'by' },
  // A luxon DateTime (the axios transformer converts backend dates to these).
  date: { type: [Object, String, null], default: null },
  // Format key passed straight to dt.formatDate (e.g. 'datetime', 'date').
  dateFormat: { type: String, default: 'datetime' },
  // Glyph between actor and date.
  separator: { type: String, default: '·' },
})

const slots = useSlots()
const hasActor = computed(() => !!slots.default || !!props.actor)

// Format via dt.formatDate only — null when the value isn't a DateTime so we
// never render a raw/unsupported value.
const formattedDate = computed(() =>
  typeof props.date?.formatDate === 'function' ? props.date.formatDate(props.dateFormat) : null,
)
</script>

<template>
  <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-1 tw:text-caption tw:text-secondary">
    <template v-if="hasActor">
      <span v-if="prefix">{{ prefix }}</span>
      <slot>{{ actor }}</slot>
    </template>
    <span v-if="hasActor && formattedDate" aria-hidden="true">{{ separator }}</span>
    <span v-if="formattedDate">{{ formattedDate }}</span>
  </div>
</template>
