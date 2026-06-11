<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const standardTypes = useLiveQuery(
  (db) => db.AuditStandardType.where().orderBy('displayOrder').exec(),
  { initial: [] },
)

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="standardTypes"
    :required="required"
    :multiple="multiple"
    nullLabel="— Select —"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <AuditStandardTypeBadgeById
              v-for="id in getArray()"
              :key="id"
              :standardTypeId="id"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(id)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"
            >Select Standard Type</span
          >
        </template>
        <template v-else>
          <AuditStandardTypeBadgeById
            v-if="modelValue"
            :standardTypeId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"
            >Select Standard Type</span
          >
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
