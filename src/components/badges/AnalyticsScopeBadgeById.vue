<script setup>
/**
 * Enum-flavour badge (CLAUDE.md badge triad): `effective_scope` has no
 * SyncEngine model — it is a string the metric functions return per call, so it
 * resolves through a static map rather than IDB.
 *
 * Labels come from SCOPE_LABEL so the tile, the tooltip and an export all name
 * the scope identically.
 */
import { SCOPE_LABEL, SCOPE_HELP } from '@/utils/analyticsFormat.js'

const props = defineProps({
  scopeId: { type: String, default: null },
  // Wrap in the explanatory tooltip ("someone with wider access sees a
  // different number"). Off inside dense lists that carry their own help.
  withHelp: { type: Boolean, default: true },
})

const STATUS_MAP = Object.fromEntries(
  Object.entries(SCOPE_LABEL).map(([id, name]) => [id, { id, name }]),
)

const scope = computed(
  () =>
    STATUS_MAP[props.scopeId] ||
    (props.scopeId ? { id: props.scopeId, name: props.scopeId } : null),
)

const help = computed(() => SCOPE_HELP[props.scopeId] || 'Scope this number was computed under.')
</script>

<template>
  <BaseTooltip v-if="scope && withHelp" :content="help">
    <AnalyticsScopeBadge :scope="scope" v-bind="$attrs" />
  </BaseTooltip>
  <AnalyticsScopeBadge v-else-if="scope" :scope="scope" v-bind="$attrs" />
</template>
