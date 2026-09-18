<script setup>
/**
 * Private / shared indicator for a saved dashboard.
 *
 * The distinction is the whole sharing model, so it is a coloured badge with an
 * icon rather than a word in the metadata line: "private" here means private
 * from EVERYONE — administrators and the company owner included — and a reader
 * who mistakes a private board for a shared one will wonder why nobody else can
 * see it, while the reverse mistake is worse.
 *
 * SCHEME_MAP holds styling only (CLAUDE.md badge-triad rule); the labels live in
 * DashboardVisibilityBadgeById's STATUS_MAP.
 */
import { IconLock, IconUsers } from '@tabler/icons-vue'

defineProps({
  visibility: { type: Object, required: true },
  showIcon: { type: Boolean, default: true },
})

const SCHEME_MAP = {
  private: { class: 'tw:bg-gray-100 tw:text-gray-700', icon: IconLock },
  shared: { class: 'tw:bg-blue-100 tw:text-blue-700', icon: IconUsers },
}

function scheme(id) {
  return SCHEME_MAP[id] || { class: 'tw:bg-gray-100 tw:text-gray-600', icon: null }
}
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(visibility?.id).class">
    <template v-if="showIcon && scheme(visibility?.id).icon" #icon>
      <component :is="scheme(visibility.id).icon" :size="12" aria-hidden="true" />
    </template>
    {{ visibility?.name || visibility?.id || '—' }}
  </BaseBadge>
</template>
