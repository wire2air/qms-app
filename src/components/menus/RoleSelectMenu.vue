<script setup>
const props = defineProps({
  required: {
    type: Boolean,
    default: false,
  },
  multiple: {
    type: Boolean,
    default: false,
  },
  excludeIds: {
    type: Array,
    default: () => [],
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

const allRoles = useLiveQuery(async (db) => db.Role.where('statusId', 'ACTIVE').exec(), {
  models: ['Role'],
  initial: [],
})

const roles = computed(() => {
  if (!props.excludeIds?.length) return allRoles.value
  const excluded = new Set(props.excludeIds)
  return allRoles.value.filter((r) => !excluded.has(r.id))
})

</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="roles"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— All roles —"
  >
    <template v-if="$slots.button" #trigger="scope">
      <slot name="button" v-bind="scope" />
    </template>

    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <RoleBadgeById
          v-for="o in options"
          :key="o.value"
          :roleId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
