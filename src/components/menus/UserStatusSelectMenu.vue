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
  <BaseSelect
    v-model="modelValue"
    :options="items"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :clearable="!required"
    nullLabel="— All statuses —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <UserStatusBadgeById
          v-for="o in options"
          :key="o.value"
          :statusId="o.value"
          :clearable="false"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
