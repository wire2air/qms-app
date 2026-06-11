<script setup>
/**
 * Specification picker for the inspection-lot create form. Uses BaseInlineSelect
 * (safe default button). Null = auto-resolve from inspection plan.
 */
defineProps({ required: { type: Boolean, default: false } })
const modelValue = defineModel({ type: [String, null], default: null })

const MATERIAL = { RAW: 'Raw', PACKAGING: 'Pkg', BULK: 'Bulk', FINISHED: 'FG' }

const specs = useLiveQuery(
  async (db) => {
    const rows = await db.Specification.where().exec()
    return rows
      .filter((s) => s.statusId === 'EFFECTIVE' || s.statusId === 'DRAFT')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  },
  { initial: [] },
)
const items = computed(() =>
  specs.value.map((s) => ({
    id: s.id,
    name: `${s.name} (${MATERIAL[s.materialKind] || s.materialKind} · v${s.version} · ${s.statusId})`,
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
