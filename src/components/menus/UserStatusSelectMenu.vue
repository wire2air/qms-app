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

const items = computed(() => [
  { id: 'ACTIVE', name: 'Active' },
  { id: 'INACTIVE', name: 'Inactive' },
])
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="items"
    nullLabel="— All statuses —"
    :required="required"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <UserStatusBadgeById
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
