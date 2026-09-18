<script setup>
/**
 * Shift select — backed by the per-tenant `shifts` lookup (Day / Evening /
 * Night …). Binds the shift's FK id. Options show the shift name + its time
 * window when set.
 */
defineProps({
  required: { type: Boolean, default: false },
  nullLabel: { type: String, default: '— Select shift —' },
})
const modelValue = defineModel({ type: [String, null], default: null })

const shifts = useLiveQuery((db) => db.Shift.where().exec(), { models: ['Shift'], initial: [] })

const options = computed(() =>
  [...(shifts.value || [])]
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name))
    .map((s) => ({
      id: s.id,
      label:
        s.startTime && s.endTime
          ? `${s.name} (${String(s.startTime).slice(0, 5)}–${String(s.endTime).slice(0, 5)})`
          : s.name,
    })),
)
</script>

<template>
  <BaseSelect
    v-model="modelValue"
    :options="options"
    optionLabel="label"
    optionValue="id"
    :nullLabel="nullLabel"
    :required="required"
    :clearable="!required"
  />
</template>
