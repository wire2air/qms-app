<script setup>
/**
 * BaseDescriptionItem — one <dt>/<dd> pair inside a <BaseDescriptionList>. The
 * label renders in a <dt>, the value (prop or default slot) in a <dd>. The pair
 * is wrapped in a <div> — valid as a direct <dl> child in HTML5 and the grouping
 * `divide-y` (from the list) needs per-item wrappers.
 *
 * The value comes from the `value` prop (with the `empty` em-dash fallback when
 * it is null / undefined / '') or from the default slot (where the consumer owns
 * its own empty handling — e.g. a badge component).
 *
 * `layout` is inherited from the parent BaseDescriptionList; pass it explicitly
 * only to override one row.
 *
 *   <BaseDescriptionItem label="CR number" :value="cr.crNumber" />
 *   <BaseDescriptionItem label="Status"><StatusBadgeById :statusId="cr.statusId" /></BaseDescriptionItem>
 */
const props = defineProps({
  label: { type: String, default: '' },
  // Primary value; only used when the default slot is empty.
  value: { type: [String, Number], default: null },
  // Fallback shown when the `value` prop is nullish/empty (slot path is exempt).
  empty: { type: String, default: '—' },
  // Override the inherited list layout for this one row. null → inherit.
  layout: {
    type: String,
    default: null,
    validator: (v) => v === null || ['inline', 'stacked'].includes(v),
  },
})

const slots = useSlots()

// Inherited from BaseDescriptionList (null when used standalone).
const list = inject('baseDescriptionList', null)
const layout = computed(() => props.layout || list?.layout?.value || 'inline')

// Whether the consumer supplied value content via the default slot.
const hasSlot = computed(() => !!slots.default)

// Resolved prop value, or null when nullish / empty string (0 stays a value).
const resolvedValue = computed(() => {
  const v = props.value
  if (v === null || v === undefined || v === '') return null
  return v
})

// Show the em-dash only on the prop path (the slot owns its own empty state).
const showEmpty = computed(() => !hasSlot.value && resolvedValue.value === null)
</script>

<template>
  <div
    :class="
      layout === 'inline'
        ? 'tw:flex tw:items-center tw:justify-between tw:gap-3 tw:py-2'
        : 'tw:flex tw:flex-col tw:py-2'
    "
  >
    <dt
      class="tw:text-secondary tw:text-label"
      :class="layout === 'inline' ? 'tw:shrink-0' : 'tw:mb-1'"
    >
      <slot name="label">{{ label }}</slot>
    </dt>
    <dd :class="layout === 'inline' ? 'tw:min-w-0 tw:text-right' : ''">
      <slot v-if="hasSlot" />
      <BaseText v-else-if="!showEmpty" variant="body" weight="medium" class="tw:text-on-main">
        {{ resolvedValue }}
      </BaseText>
      <BaseText v-else variant="body" color="secondary">{{ empty }}</BaseText>
    </dd>
  </div>
</template>
