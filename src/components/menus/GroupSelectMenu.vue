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

const groups = useLiveQuery(async (db) => db.Team.where().exec(), { models: ['Team'], initial: [] })

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu v-model="modelValue" :items="groups" :required="required" :multiple="multiple">
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <!-- MULTIPLE MODE -->
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <GroupBadgeById
              v-for="teamId in getArray()"
              :key="teamId"
              :teamId="teamId"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(teamId)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"> Select Groups </span>
        </template>

        <!-- SINGLE MODE -->
        <template v-else>
          <GroupBadgeById
            v-if="modelValue"
            :teamId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"> Select Group </span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
