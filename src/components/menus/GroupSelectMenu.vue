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
  // Empty-state placeholder, standardized to "— Select Group —" (matches
  // Site/Department pickers). The dropdown still offers an "all" row when the
  // menu isn't required.
  nullLabel: {
    type: String,
    default: '— Select Group —',
  },
})

const modelValue = defineModel({
  type: [String, Array, null],
  default: null,
})

const groups = useLiveQuery(async (db) => db.Team.where().exec(), { models: ['Team'], initial: [] })
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="groups"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    :placeholder="nullLabel"
    nullLabel="All"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <GroupBadgeById
          v-for="o in options"
          :key="o.value"
          :teamId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
