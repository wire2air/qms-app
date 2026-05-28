<script setup>
import { IconTool } from '@tabler/icons-vue'

/**
 * EquipmentBadge — receives a full Equipment object. Renders
 * name + code (when present). Status colour comes from SCHEME_MAP so
 * out-of-service / retired equipment is visually distinct from
 * in-service ones.
 */
defineProps({
  equipment: { type: Object, required: true },
})

// Status drives colour. Keep classes in SCHEME_MAP only (no labels) so
// the badge stays styling-pure per the badge-triad convention.
const SCHEME_MAP = {
  IN_SERVICE: { class: 'tw:text-on-main' },
  OUT_OF_SERVICE: { class: 'tw:text-amber-700' },
  RETIRED: { class: 'tw:text-secondary tw:line-through' },
}
const scheme = (id) => SCHEME_MAP[id] || { class: 'tw:text-on-main' }
</script>

<template>
  <BaseBadge v-bind="$attrs" :class="scheme(equipment?.statusId).class">
    <template #icon>
      <IconTool :size="14" class="tw:text-secondary" />
    </template>
    {{ equipment?.name || equipment?.id || '—' }}
    <span v-if="equipment?.code" class="tw:text-xs tw:text-secondary tw:font-mono tw:ml-1">
      · {{ equipment.code }}
    </span>
  </BaseBadge>
</template>
