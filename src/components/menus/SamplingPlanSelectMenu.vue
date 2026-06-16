<script setup>
/**
 * Sampling-plan picker. When productId + inspectionPoint are provided the list
 * is pre-filtered to plans for that product+point (or general plans with no
 * productId for the same point). Null value = auto-resolve from the inspection
 * plan.
 */
const props = defineProps({
  required: { type: Boolean, default: false },
  productId: { type: String, default: null },
  inspectionPoint: { type: String, default: null },
})
const modelValue = defineModel({ type: [String, null], default: null })

const POINT = { INCOMING: 'IQC', IN_PROCESS: 'IPQC', FINAL: 'FQC', OUTGOING: 'OQC' }

const plans = useLiveQueryWithDeps(
  [() => props.productId, () => props.inspectionPoint],
  async (db, [productId, inspectionPoint]) => {
    const rows = await db.SamplingPlan.where('statusId', 'ACTIVE').exec()
    return rows
      .filter((p) => {
        if (inspectionPoint && p.inspectionPoint !== inspectionPoint) return false
        if (!productId) return true
        return p.productId === productId || p.productId === null
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  },

  { models: ['SamplingPlan'], initial: [] },
)

const items = computed(() =>
  plans.value.map((p) => ({
    id: p.id,
    name: `${p.name} (${POINT[p.inspectionPoint] || p.inspectionPoint})`,
  })),
)
</script>

<template>
  <BaseInlineSelect
    v-model="modelValue"
    :items="items"
    :required="required"
    nullLabel="Auto Resolve from Plan"
    placeholder="Auto Resolve from Plan"
    class="tw:w-full"
  />
</template>
