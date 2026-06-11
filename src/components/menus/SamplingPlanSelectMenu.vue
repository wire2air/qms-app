<script setup>
/**
 * Sampling-plan picker for the inspection-lot create form. Uses BaseInlineSelect
 * (safe default button — avoids the BaseSelectMenu invisible-trigger issue when
 * no #button slot is wired). Null = auto-resolve from inspection plan.
 */
defineProps({ required: { type: Boolean, default: false } })
const modelValue = defineModel({ type: [String, null], default: null })

const POINT = { INCOMING: 'IQC', IN_PROCESS: 'IPQC', FINAL: 'FQC', OUTGOING: 'OQC' }

const plans = useLiveQuery(
  async (db) => {
    const rows = await db.SamplingPlan.where().exec()
    return rows
      .filter((p) => p.statusId === 'ACTIVE')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  },
  { initial: [] },
)
const items = computed(() =>
  plans.value.map((p) => ({
    id: p.id,
    name: `${p.name} (${POINT[p.inspectionPoint] || p.inspectionPoint} · ${p.statusId})`,
  })),
)
</script>

<template>
  <BaseInlineSelect
    v-model="modelValue"
    :items="items"
    :required="required"
    nullLabel="— Auto-resolve from plan —"
    placeholder="— Auto-resolve from plan —"
    class="tw:w-full"
  />
</template>
