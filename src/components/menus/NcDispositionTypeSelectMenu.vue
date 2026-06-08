<script setup>
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const dispositionTypes = useLiveQuery(
  (db) => db.NcDispositionType.where().orderBy('displayOrder').exec(),
  { initial: [] },
)

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="dispositionTypes"
    :required="required"
    :multiple="multiple"
    nullLabel="— Select —"
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <NcDispositionTypeBadgeById
              v-for="id in getArray()"
              :key="id"
              :dispositionTypeId="id"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(id)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"
            >Select Disposition</span
          >
        </template>
        <template v-else>
          <NcDispositionTypeBadgeById
            v-if="modelValue"
            :dispositionTypeId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder"
            >Select Disposition</span
          >
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
