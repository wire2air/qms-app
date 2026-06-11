<script setup>
/**
 * Audit-standard picker. List is unfiltered — the generator (Phase
 * B-5/C) will refuse to mint an instance for a program whose standard
 * has no EFFECTIVE version, but the program-config UI lets you pick
 * any standard. Standards with only a DRAFT yet are still useful for
 * one-time / future-dated programs.
 */
defineProps({
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
})

const modelValue = defineModel({ type: [String, Array, null], default: null })

const standards = useLiveQuery(
  (db) =>
    db.AuditStandard.where()
      .exec()
      .then((rows) => rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''))),
  { initial: [] },
)

function getArray() {
  return Array.isArray(modelValue.value) ? modelValue.value : []
}
</script>

<template>
  <BaseSelectMenu
    v-model="modelValue"
    :items="standards"
    :required="required"
    :multiple="multiple"
    nullLabel="— No standard —"
    searchable
  >
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <template v-if="multiple">
          <div v-if="getArray().length" class="tw:flex tw:flex-wrap tw:gap-1">
            <AuditStandardBadgeById
              v-for="id in getArray()"
              :key="id"
              :standardId="id"
              :clearable="!required || getArray().length > 1"
              @clear="() => scope.clear(id)"
            />
          </div>
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Standard</span>
        </template>
        <template v-else>
          <AuditStandardBadgeById
            v-if="modelValue"
            :standardId="modelValue"
            :clearable="!required"
            selectable
            @clear="() => scope.clear(modelValue)"
          />
          <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">Select Standard</span>
        </template>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
