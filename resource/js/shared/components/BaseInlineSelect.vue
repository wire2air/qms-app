<script setup>
/**
 * Thin wrapper around BaseSelectMenu for inline enum lists
 * (`[{id, name}]` static arrays) that don't have their own entity-
 * specific SelectMenu component.
 *
 * Per the FE CLAUDE.md select-menu rule, entity pickers must go
 * through `XSelectMenu` triads. This component is the escape hatch
 * for non-entity enums — status / type / frequency picker — which
 * would otherwise pay the cost of writing a custom `#button` slot
 * at every call site.
 *
 * `BaseSelectMenu` has no default `#button` content, so passing
 * `required=true` without a slot renders an empty button. This
 * wrapper supplies a chip-style default that shows the currently-
 * selected item's name (or a placeholder when empty).
 */
defineProps({
  items: { type: Array, required: true },
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Select…' },
  nullLabel: { type: String, default: 'All' },
})
const modelValue = defineModel({ type: [String, Number, Array, null], default: null })

function labelFor(items, id) {
  return items.find((it) => it.id === id)?.name ?? null
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="items"
    :required="required"
    :multiple="multiple"
    :nullLabel="nullLabel"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div
            v-if="Array.isArray(scope.selected) && scope.selected.length"
            class="tw:flex tw:flex-wrap tw:gap-1"
          >
            <BaseBadge
              v-for="id in scope.selected"
              :key="id"
              selectable
              :clearable="!required || scope.selected.length > 1"
              @clear="() => scope.clear(id)"
            >
              {{ labelFor(items, id) ?? id }}
            </BaseBadge>
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            {{ placeholder }}
          </span>
        </template>
        <template v-else>
          <BaseBadge
            v-if="scope.selected != null"
            selectable
            :clearable="!required"
            @clear="() => scope.clear(scope.selected)"
          >
            {{ labelFor(items, scope.selected) ?? scope.selected }}
          </BaseBadge>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            {{ placeholder }}
          </span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
