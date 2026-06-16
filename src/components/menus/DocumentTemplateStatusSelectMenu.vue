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

const statuses = useLiveQuery(async (db) => db.DocumentTemplateStatus.where().exec(), {
  models: ['DocumentTemplateStatus'],
  initial: [],
})
</script>

<template>
  <BaseSelectMenu v-model="modelValue" :items="statuses" :required="required">
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <DocumentTemplateStatusBadgeById
          v-if="modelValue"
          :statusId="modelValue"
          :clearable="!required"
          selectable
          @clear="() => scope.clear(modelValue)"
        />
        <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"> Select Status </span>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
