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

  { models: ['Specification'], initial: [] },
)

const items = computed(() =>
  specs.value.map((s) => ({
    id: s.id,
    // `materialKind` was dropped from specifications by migration 20260720001050;
    // this label read `MATERIAL[s.materialKind] || s.materialKind`, so every option
    // rendered "(undefined · v1)". Found 2026-09-01 during the QC hardening pass.
    name: `${s.name} (v${s.version})`,
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
