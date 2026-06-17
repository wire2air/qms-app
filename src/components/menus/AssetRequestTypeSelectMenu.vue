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

const types = useLiveQuery((db) => db.AssetRequestType.where().orderBy('displayOrder').exec(), {
  models: ['AssetRequestType'],
  initial: [],
})

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="types"
    nullLabel="— All types —"
    :required="required"
    :multiple="multiple"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <AssetRequestTypeBadgeById
              v-for="typeId in getArray()"
              :key="typeId"
              :typeId="typeId"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(typeId)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Type</span>
        </template>
        <template v-else>
          <AssetRequestTypeBadgeById
            v-if="modelValue"
            :typeId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Type</span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
