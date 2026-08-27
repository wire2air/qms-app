<script setup>
/**
 * Enum-flavour resolver for the dashboard visibility badge — there is no
 * SyncEngine model behind `visibility`, it is a CHECK-constrained column on
 * analytics_dashboards, so the labels come from a static map.
 */
import { VISIBILITY_META } from '@/utils/analyticsDashboardAccess.js'

const props = defineProps({
  visibilityId: { type: String, default: null },
  showIcon: { type: Boolean, default: true },
})

// Data only (CLAUDE.md: labels never go in SCHEME_MAP, classes never in here).
const STATUS_MAP = {
  private: { id: 'private', name: VISIBILITY_META.private.name },
  shared: { id: 'shared', name: VISIBILITY_META.shared.name },
}

const visibility = computed(
  () =>
    STATUS_MAP[props.visibilityId] ||
    (props.visibilityId ? { id: props.visibilityId, name: props.visibilityId } : null),
)

// The badge alone doesn't say what "private" excludes, and that is exactly the
// thing people get wrong about it.
const help = computed(() => VISIBILITY_META[props.visibilityId]?.help ?? null)
</script>

<template>
  <BaseTooltip v-if="visibility && help" :content="help">
    <DashboardVisibilityBadge :visibility="visibility" :showIcon="showIcon" v-bind="$attrs" />
  </BaseTooltip>
  <DashboardVisibilityBadge
    v-else-if="visibility"
    :visibility="visibility"
    :showIcon="showIcon"
    v-bind="$attrs"
  />
</template>
