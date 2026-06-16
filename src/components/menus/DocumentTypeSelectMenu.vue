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

const documentTypes = useLiveQuery((db) => db.DocumentType.where().orderBy('displayOrder').exec(), {
  models: ['DocumentType'],
  initial: [],
})

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="documentTypes"
    :required="required"
    :multiple="multiple"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <!-- MULTIPLE MODE -->
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <DocumentTypeBadgeById
              v-for="id in getArray()"
              :key="id"
              :documentTypeId="id"
              :clearable="!required || getArray().length > 1"
              :iconOnly="false"
              @clear="() => scope.clear(id)"
            />
          </div>

          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            Select Document Types
          </span>
        </template>

        <!-- SINGLE MODE -->
        <template v-else>
          <DocumentTypeBadgeById
            v-if="modelValue"
            :documentTypeId="modelValue"
            :clearable="!required"
            :iconOnly="false"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
            Select Document Type
          </span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
