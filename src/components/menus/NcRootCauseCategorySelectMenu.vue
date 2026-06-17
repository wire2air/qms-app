<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const categories = useLiveQuery(
  (db) => db.NcRootCauseCategory.where().orderBy('displayOrder').exec(),

  { models: ['NcRootCauseCategory'], initial: [] },
)

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="categories"
    nullLabel="— All categories —"
    :required="required"
    :multiple="multiple"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <BaseBadge
              v-for="id in getArray()"
              :key="id"
              class="tw:bg-gray-100 tw:text-gray-700"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(id)"
              >{{ id }}</BaseBadge
            >
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Category</span>
        </template>
        <template v-else>
          <BaseBadge
            v-if="modelValue"
            class="tw:bg-gray-100 tw:text-gray-700"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
            >{{ modelValue }}</BaseBadge
          >
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Category</span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
