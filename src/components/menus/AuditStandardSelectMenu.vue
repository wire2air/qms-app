<script setup>
/**
 * Audit-standard picker. Drafts stay pickable — the generator (Phase
 * B-5/C) will refuse to mint an instance for a program whose standard
 * has no EFFECTIVE version, but a draft is still useful for one-time /
 * future-dated programs. ARCHIVED standards are excluded: archiving is
 * exactly "leave the pickers for new audits" (existing audits keep
 * their snapshot).
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
      .then((rows) =>
        rows
          .filter((r) => r.statusId !== 'ARCHIVED')
          .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
      ),

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
