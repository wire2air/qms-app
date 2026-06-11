<script setup>
defineProps({
  required: { type: Boolean, default: false },
})
const modelValue = defineModel({ type: [String, null], default: null })

const MATERIAL = { RAW: 'Raw', PACKAGING: 'Pkg', BULK: 'Bulk', FINISHED: 'FG' }

const specs = useLiveQuery(
  async (db) => {
    const rows = await db.Specification.where().exec()
    return rows
      .filter((s) => s.statusId === 'EFFECTIVE' || s.statusId === 'DRAFT')
      .sort((a, b) => a.name.localeCompare(b.name))
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
