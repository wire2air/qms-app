<script setup>
/**
 * Enum-flavour badge (CLAUDE.md badge triad) for the metric read tier. No
 * SyncEngine model exists — `tier` is a column the metric functions return.
 */
import { TIER_LABEL, TIER_HELP } from '@/utils/analyticsFormat.js'

const props = defineProps({
  tierId: { type: String, default: null },
  withHelp: { type: Boolean, default: true },
})

const STATUS_MAP = Object.fromEntries(
  Object.entries(TIER_LABEL).map(([id, name]) => [id, { id, name }]),
)

const tier = computed(
  () =>
    STATUS_MAP[props.tierId] || (props.tierId ? { id: props.tierId, name: props.tierId } : null),
)

const help = computed(() => TIER_HELP[props.tierId] || 'How this number was computed.')
</script>

<template>
  <BaseTooltip v-if="tier && withHelp" :content="help">
    <AnalyticsTierBadge :tier="tier" v-bind="$attrs" />
  </BaseTooltip>
  <AnalyticsTierBadge v-else-if="tier" :tier="tier" v-bind="$attrs" />
</template>
