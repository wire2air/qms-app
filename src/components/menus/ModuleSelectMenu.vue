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

const modules = useLiveQuery((db) => db.Module.where().orderBy('displayOrder').exec(), {
  models: ['Module'],
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
  <BaseSelectMenu v-model="modelValue" :items="modules" :required="required" :multiple="multiple">
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <!-- MULTIPLE MODE -->
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <ModuleBadgeById
              v-for="id in getArray()"
              :key="id"
              :moduleId="id"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(id)"
            />
          </div>

          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"> — All modules — </span>
        </template>

        <!-- SINGLE MODE -->
        <template v-else>
          <ModuleBadgeById
            v-if="modelValue"
            :moduleId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"> — All modules — </span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
