<script setup>
/**
 * Entity lookup select, chosen by NAME — for hosts that store the entity as
 * data instead of compile-time markup (checklist lookup columns, 2026-08-27).
 *
 * unplugin-vue-components resolves component tags at COMPILE time, so a shared
 * component like BaseChecklist cannot `<component :is="'SiteSelectMenu'">` its
 * way to a menu. This wrapper imports the menus statically and dispatches on
 * the `entity` prop; it also owns the CASCADE mapping (LOOKUP_CASCADES) so the
 * host only passes the parent's entity + current value and stays free of
 * app-layer imports.
 */
import { LOOKUP_MENUS } from '@/components/menus/lookupMenus.js'
import { LOOKUP_CASCADES } from '@/constants/formBuilderConfig'

const props = defineProps({
  entity: { type: String, required: true },
  disabled: { type: Boolean, default: false },
  nullLabel: { type: String, default: '— Select —' },
  /** The narrowing sibling, when the author configured one. */
  parentEntity: { type: String, default: null },
  parentValue: { type: String, default: null },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const Menu = computed(() => LOOKUP_MENUS[props.entity] || null)

// e.g. child department + parent site → { siteId: <parentValue> }. An unknown
// pair applies no filter — same forgiving rule as the form level.
const cascadeProps = computed(() => {
  if (!props.parentEntity) return {}
  const propName = LOOKUP_CASCADES[props.entity]?.[props.parentEntity]
  return propName ? { [propName]: props.parentValue || null } : {}
})
</script>

<template>
  <component
    :is="Menu"
    v-if="Menu"
    v-model="modelValue"
    :disabled="disabled"
    :nullLabel="nullLabel"
    v-bind="cascadeProps"
  />
  <div v-else class="tw:text-sm tw:text-red-500">Unknown lookup source: {{ entity }}</div>
</template>
