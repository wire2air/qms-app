<script setup>
/**
 * Specification picker. When productId is provided the list is pre-filtered to
 * specs for that product (plus general specs with productId=null). Null value =
 * auto-resolve from the inspection plan.
 */
const props = defineProps({
  required: { type: Boolean, default: false },
  productId: { type: String, default: null },
})
const modelValue = defineModel({ type: [String, null], default: null })

const MATERIAL = { RAW: 'Raw', PACKAGING: 'Pkg', BULK: 'Bulk', FINISHED: 'FG' }

const specs = useLiveQueryWithDeps(
  [() => props.productId],
  async (db, [productId]) => {
    const rows = await db.Specification.where().exec()
    return rows
      .filter((s) => {
        if (s.statusId !== 'EFFECTIVE') return false
        if (!productId) return true
        return s.productId === productId || s.productId === null
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  },
  { initial: [] },
)

const items = computed(() =>
  specs.value.map((s) => ({
    id: s.id,
    name: `${s.name} (${MATERIAL[s.materialKind] || s.materialKind} · v${s.version})`,
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
