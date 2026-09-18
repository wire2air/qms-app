<script setup>
/**
 * Table Style settings — shared by the Checklist and Input Table fields.
 * Presets set headerColor + striped + bordered together; below that the author
 * can tweak each granularly (header colour swatch + two toggles). Renders via
 * `tableStyleClasses` in the builder preview and at runtime.
 */
import { IconCheck } from '@tabler/icons-vue'
import { TABLE_HEADER_COLORS, TABLE_STYLE_PRESETS } from '@/utils/tableStyle'

const field = defineModel('field', { type: Object, required: true })

const headerColor = computed(() => field.value.headerColor || 'default')

function applyPreset(p) {
  field.value.headerColor = p.headerColor
  field.value.striped = p.striped
  field.value.bordered = p.bordered
}
function isActivePreset(p) {
  return (
    (field.value.headerColor || 'default') === p.headerColor &&
    !!field.value.striped === p.striped &&
    !!field.value.bordered === p.bordered
  )
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-3">
    <BaseText as="div" variant="overline">Table Style</BaseText>

    <!-- Presets -->
    <div class="tw:flex tw:flex-wrap tw:gap-1.5">
      <button
        v-for="p in TABLE_STYLE_PRESETS"
        :key="p.id"
        type="button"
        class="tw:px-2.5 tw:py-1 tw:text-xs tw:font-medium tw:rounded-md tw:border tw:transition-colors"
        :class="
          isActivePreset(p)
            ? 'tw:border-primary tw:bg-primary/10 tw:text-primary'
            : 'tw:border-divider tw:text-secondary tw:hover:bg-main-hover'
        "
        @click="applyPreset(p)"
      >
        {{ p.name }}
      </button>
    </div>

    <!-- Header colour -->
    <div>
      <label class="tw:text-sm tw:font-medium tw:text-secondary tw:mb-1 tw:block">
        Header colour
      </label>
      <div class="tw:flex tw:flex-wrap tw:gap-1.5">
        <button
          v-for="c in TABLE_HEADER_COLORS"
          :key="c.id"
          type="button"
          class="tw:size-7 tw:rounded-md tw:border tw:flex tw:items-center tw:justify-center tw:transition-all"
          :class="[
            c.swatch,
            headerColor === c.id
              ? 'tw:border-primary tw:ring-2 tw:ring-primary/30'
              : 'tw:border-divider',
          ]"
          :title="c.name"
          @click="field.headerColor = c.id"
        >
          <IconCheck
            v-if="headerColor === c.id"
            :size="14"
            :class="c.id === 'default' || c.id === 'gray' ? 'tw:text-on-main' : 'tw:text-white'"
          />
        </button>
      </div>
    </div>

    <!-- Granular toggles -->
    <div class="tw:flex tw:flex-col tw:gap-2">
      <BaseCheckbox v-model="field.striped">Striped rows</BaseCheckbox>
      <BaseCheckbox v-model="field.bordered">Cell borders</BaseCheckbox>
    </div>
  </div>
</template>
