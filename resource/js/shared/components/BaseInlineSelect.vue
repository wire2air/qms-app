<script setup>
/**
 * Thin wrapper around BaseSelect for inline enum lists (`[{id, name}]` static
 * arrays) that don't have their own entity-specific SelectMenu component.
 *
 * Per the FE CLAUDE.md select-menu rule, entity pickers must go through
 * `XSelectMenu` triads. This component is the escape hatch for non-entity
 * enums — status / type / frequency pickers — which would otherwise repeat a
 * `#selected` badge slot at every call site. It renders the selected value(s)
 * as removable chips and shows `placeholder` (or the `nullLabel` "All" row /
 * label when not required) when empty.
 */
defineProps({
  items: { type: Array, required: true },
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Select…' },
  nullLabel: { type: String, default: 'All' },
})
const modelValue = defineModel({ type: [String, Number, Array, null], default: null })
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="items"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :nullLabel="nullLabel"
    :placeholder="placeholder"
    :clearable="!required"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <BaseBadge
          v-for="o in options"
          :key="o.value"
          :clearable="multiple ? !required || options.length > 1 : !required"
          @clear="() => remove(o)"
        >
          {{ o.label }}
        </BaseBadge>
      </div>
    </template>
  </BaseSelect>
</template>
