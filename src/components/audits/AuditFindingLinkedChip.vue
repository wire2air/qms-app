<script setup>
/**
 * Compact chip for a record spawned/linked from an audit finding — shows the
 * linked record's code + live status so an auditor sees remediation progress
 * at a glance (#10). Clicking opens the record. Live-queries the target by id
 * so the status stays current as the CAPA/NC/CR/Training moves through its
 * workflow.
 */
import { IconExternalLink } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  // 'NC' | 'CAPA' | 'CR' | 'TRAINING'
  kind: { type: String, required: true },
  targetId: { type: String, required: true },
})

const router = useRouter()

const MAP = {
  NC: { model: 'Nonconformance', routeStem: 'nonconformances', code: 'ncNumber' },
  CAPA: { model: 'Capa', routeStem: 'capas', code: 'capaNumber' },
  CR: { model: 'ChangeRequest', routeStem: 'change-requests', code: 'crNumber' },
  TRAINING: { model: 'TrainingInstance', routeStem: 'training-instances', code: null },
}
const cfg = computed(() => MAP[props.kind] ?? null)

const record = useLiveQueryWithDeps(
  [() => props.kind, () => props.targetId],
  async (db, [kind, id]) => {
    const c = MAP[kind]
    if (!c || !id) return null
    return db[c.model].findByPk(id)
  },
)

const code = computed(() => {
  const f = cfg.value?.code
  return (f && record.value?.[f]) || props.kind
})
// CAPA/NC/CR carry statusId; TrainingInstance uses `status`.
const status = computed(() => record.value?.statusId ?? record.value?.status ?? null)

function open() {
  if (!cfg.value) return
  router.push(getCompanyPath(`/${cfg.value.routeStem}/${props.targetId}`))
}
</script>

<template>
  <button
    type="button"
    class="tw:inline-flex tw:items-center tw:gap-1 tw:text-micro tw:font-medium tw:bg-emerald-100 tw:text-emerald-700 tw:rounded tw:pl-1.5 tw:pr-1.5 tw:py-0.5 tw:cursor-pointer tw:border-0 tw:hover:bg-emerald-200"
    :title="`Open linked ${kind}`"
    @click.stop="open"
  >
    <span class="tw:font-mono">{{ code }}</span>
    <span
      v-if="status"
      class="tw:rounded tw:bg-white/70 tw:px-1 tw:text-[9px] tw:font-semibold tw:uppercase tw:tracking-wide"
    >
      {{ status }}
    </span>
    <IconExternalLink :size="10" />
  </button>
</template>
