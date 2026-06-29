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

  { models: ['AuditStandard'], initial: [] },
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="standards"
    optionLabel="name"
    optionValue="id"
    :required="required"
    :multiple="multiple"
    :clearable="!required"
    nullLabel="— No standard —"
  >
    <template #selected="{ options, remove }">
      <div class="tw:flex tw:flex-wrap tw:gap-1">
        <AuditStandardBadgeById
          v-for="o in options"
          :key="o.value"
          :standardId="o.value"
          :clearable="multiple && (!required || options.length > 1)"
          @clear="() => remove(o)"
        />
      </div>
    </template>
  </BaseSelect>
</template>
