<script setup>
defineProps({
  required: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

const relatedStandards = useLiveQuery((db) => db.RelatedStandard.where().exec(), {
  models: ['RelatedStandard'],
  initial: [],
})

/**
 * Normalize model for easier handling
 */
function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="relatedStandards"
    nullLabel="— All standards —"
    :required="required"
    :multiple="multiple"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <!-- MULTIPLE MODE -->
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <RelatedStandardBadgeById
              v-for="id in getArray()"
              :key="id"
              :relatedStandardId="id"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(id)"
            />
          </div>

          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            Select Related Standards
          </span>
        </template>

        <!-- SINGLE MODE -->
        <template v-else>
          <RelatedStandardBadgeById
            v-if="modelValue"
            :relatedStandardId="modelValue"
            :clearable="!required"
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            Select Related Standard
          </span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
