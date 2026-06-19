<script setup>
/**
 * Renders a reference to any record (by entity type + id) as a compact chip:
 * a short type label + the record's number, linking to its detail page when one
 * exists (see recordRef registry). Used by RecordLineagePanel.
 */
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { recordRefConfig } from '@/utils/recordRef.js'

const props = defineProps({
  type: { type: String, required: true },
  id: { type: String, required: true },
})

const cfg = computed(() => recordRefConfig(props.type))

const record = useLiveQueryWithDeps(
  [() => props.type, () => props.id],
  async (db, [type, id]) => {
    const c = recordRefConfig(type)
    if (!c || !db[c.model]) return null
    return db[c.model].findByPk(id, { force: true })
  },
  { initial: null },
)

const label = computed(() => cfg.value?.label || props.type)
const number = computed(() => {
  const n = cfg.value?.numberField ? record.value?.[cfg.value.numberField] : null
  return n || `${props.id.slice(0, 8)}…`
})
const to = computed(() =>
  cfg.value?.path ? getCompanyPath(cfg.value.path(props.id)) : null,
)
const TONE = {
  InspectionLot: 'tw:bg-teal-100 tw:text-teal-700',
  Nonconformance: 'tw:bg-rose-100 tw:text-rose-700',
  Capa: 'tw:bg-amber-100 tw:text-amber-700',
  ChangeRequest: 'tw:bg-indigo-100 tw:text-indigo-700',
  CustomerComplaint: 'tw:bg-orange-100 tw:text-orange-700',
  AuditFinding: 'tw:bg-emerald-100 tw:text-emerald-700',
  TrainingInstance: 'tw:bg-blue-100 tw:text-blue-700',
}
const tone = computed(() => TONE[props.type] || 'tw:bg-gray-100 tw:text-gray-600')
</script>

<template>
  <component
    :is="to ? 'RouterLink' : 'span'"
    :to="to || undefined"
    class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:px-2 tw:py-0.5 tw:text-xs tw:no-underline tw:max-w-full"
    :class="[tone, to ? 'tw:hover:opacity-80 tw:transition-opacity' : '']"
  >
    <span class="tw:font-semibold tw:opacity-70 tw:uppercase tw:text-[10px] tw:tracking-wide">{{ label }}</span>
    <span class="tw:font-mono tw:font-medium tw:truncate">{{ number }}</span>
  </component>
</template>
