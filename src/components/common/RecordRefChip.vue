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

// A type that isn't a built-in is a promoted module's key ('deviation') —
// tenant data, so it can't live in the static registry. Its records are all
// `Record` rows, numbered recordNumber, at /m/<key>/<id>; the human label
// comes from the module's own template (2026-08-29).
const moduleTemplate = useLiveQueryWithDeps(
  [() => props.type],
  async (db, [type]) => {
    if (!type || recordRefConfig(type)) return null
    const rows = await db.FormTemplate.where('internalName', type).exec()
    return rows.find((t) => t.isModule) || null
  },
  { models: ['FormTemplate'], initial: null },
)

const cfg = computed(() => {
  const builtIn = recordRefConfig(props.type)
  if (builtIn) return builtIn
  if (!props.type) return null
  return {
    model: 'Record',
    numberField: 'recordNumber',
    label: moduleTemplate.value?.moduleConfig?.displayName || moduleTemplate.value?.title || props.type,
    path: (id) => `/m/${props.type}/${id}`,
  }
})

const record = useLiveQueryWithDeps(
  [() => props.type, () => props.id],
  async (db, [type, id]) => {
    const c = recordRefConfig(type) ?? { model: 'Record' }
    if (!db[c.model]) return null
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
  QualityEvent: 'tw:bg-sky-100 tw:text-sky-700',
  Nonconformance: 'tw:bg-rose-100 tw:text-rose-700',
  Capa: 'tw:bg-amber-100 tw:text-amber-700',
  ChangeRequest: 'tw:bg-indigo-100 tw:text-indigo-700',
  CustomerComplaint: 'tw:bg-orange-100 tw:text-orange-700',
  AuditFinding: 'tw:bg-emerald-100 tw:text-emerald-700',
  TrainingInstance: 'tw:bg-blue-100 tw:text-blue-700',
}
const tone = computed(
  () => TONE[props.type] || 'tw:bg-violet-100 tw:text-violet-700',
)
</script>

<template>
  <component
    :is="to ? 'RouterLink' : 'span'"
    :to="to || undefined"
    class="tw:inline-flex tw:items-center tw:gap-1.5 tw:rounded-full tw:px-2 tw:py-0.5 tw:text-xs tw:no-underline tw:max-w-full"
    :class="[tone, to ? 'tw:hover:opacity-80 tw:transition-opacity' : '']"
  >
    <span class="tw:font-semibold tw:opacity-70 tw:uppercase tw:text-caption tw:tracking-wider">{{ label }}</span>
    <span class="tw:font-medium tw:truncate">{{ number }}</span>
  </component>
</template>
