<script setup>
defineProps({
  required: { type: Boolean, default: false },
})
const modelValue = defineModel({ type: [String, null], default: null })

const POINT = { INCOMING: 'IQC', IN_PROCESS: 'IPQC', FINAL: 'FQC', OUTGOING: 'OQC' }

const plans = useLiveQuery(
  async (db) => {
    const rows = await db.SamplingPlan.where().exec()
    return rows
      .filter((p) => p.statusId === 'ACTIVE' || p.statusId === 'DRAFT')
      .sort((a, b) => a.name.localeCompare(b.name))
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
  <BaseSelectMenu v-model="modelValue" :items="items" :required="required" nullLabel="— Auto-resolve from plan —">
    <template #button="scope">
      <slot name="button" v-bind="scope">
        <BaseBadge
          v-if="scope.selected"
          selectable
          :clearable="!required"
          @clear="() => scope.clear(scope.selected)"
        >
          {{ items.find((i) => i.id === scope.selected)?.name ?? scope.selected }}
        </BaseBadge>
        <span v-else class="tw:text-sm tw:font-medium tw:text-placeholder">— Auto-resolve from plan —</span>
      </slot>
    </template>
  </BaseSelectMenu>
</template>
