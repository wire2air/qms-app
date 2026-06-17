<script setup>
defineProps({
  required: {
    type: Boolean,
    default: false,
  },
})

const modelValue = defineModel({
  type: [String, null],
  default: null,
})

const optionSets = useLiveQuery(async (db) => db.OptionSet.where().exec(), {
  models: ['OptionSet'],
  initial: [],
})
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="optionSets"
    nullLabel="— All option sets —"
    :required="required"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <OptionSetBadgeById
          v-if="modelValue"
          :optionSetId="modelValue"
          :clearable="!required"
          selectable
          @clear="() => scope.clear(modelValue)"
        />
        <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">
          Select Option Set
        </span>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
