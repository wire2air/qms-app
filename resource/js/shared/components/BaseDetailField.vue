<script setup>
/**
 * BaseDetailField — a read-only "label over (or beside) value" pair for detail
 * views and side panels. Replaces the copy-pasted
 *   <div>
 *     <p class="tw:text-secondary tw:mb-1">Site</p>
 *     <SiteBadgeById :siteId="..." />
 *   </div>
 * found in ~68+ files.
 *
 * NOT a <label> — there is no associated form control here (see audit §13.6),
 * so the label is plain secondary text, never a <label for>. For an editable
 * field, use BaseField instead.
 *
 * The value may come from the `value` prop (with the `empty` fallback applied
 * when it is null / undefined / '') or from the default slot (where the
 * consumer owns its own empty handling — e.g. a badge component).
 *
 * @example
 *   <BaseDetailField label="Supplier code" :value="supplier.code" />
 *   <BaseDetailField label="Site"><SiteBadgeById :siteId="user.siteId" /></BaseDetailField>
 *   <BaseDetailField label="Status" layout="inline"><StatusBadge ... /></BaseDetailField>
 */
const props = defineProps({
  label: { type: String, default: '' },
  // Primary value; only used when the default slot is empty.
  value: { type: [String, Number], default: null },
  // 'stacked' — label above value (default); 'inline' — label left, value right.
  layout: {
    type: String,
    default: 'stacked',
    validator: (v) => ['stacked', 'inline'].includes(v),
  },
  // Fallback shown when the `value` prop is nullish/empty (slot path is exempt).
  empty: { type: String, default: '—' },
})

const slots = useSlots()

// Whether the consumer supplied value content via the default slot.
const hasSlot = computed(() => !!slots.default)

// Resolved prop value, or null when it is nullish / empty string.
const resolvedValue = computed(() => {
  const v = props.value
  if (v === null || v === undefined || v === '') return null
  return v
})

// Show the em-dash only on the prop path (the slot owns its own empty state).
const showEmpty = computed(() => !hasSlot.value && resolvedValue.value === null)
</script>

<template>
  <div :class="layout === 'inline' ? 'tw:flex tw:items-center tw:justify-between tw:gap-3' : ''">
    <p
      v-if="label || $slots.label"
      class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
      :class="layout === 'stacked' ? 'tw:mb-1' : 'tw:shrink-0 tw:normal-case'"
    >
      <slot name="label">{{ label }}</slot>
    </p>
    <div :class="layout === 'inline' ? 'tw:min-w-0 tw:text-right' : ''">
      <slot v-if="hasSlot" />
      <BaseText
        v-else-if="!showEmpty"
        variant="body"
        weight="medium"
        class="tw:text-on-main"
      >
        {{ resolvedValue }}
      </BaseText>
      <BaseText v-else variant="body" color="secondary">{{ empty }}</BaseText>
    </div>
  </div>
</template>
