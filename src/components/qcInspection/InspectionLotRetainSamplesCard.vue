<script setup>
/**
 * Rail card: retain samples kept from this inspection lot. Lists each RS with
 * its derived destruction state, links to the detail page, and offers Add
 * (permission-gated) via RetainSampleCreateDialog.
 */
import { IconArchive, IconPlus } from '@tabler/icons-vue'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({ lotId: { type: String, required: true } })

const router = useRouter()
const showCreate = ref(false)
const canCreate = computed(() => isAllowed(['inspection_qc:create', 'inspection_qc:execute']))

const samples = useLiveQueryWithDeps(
  [() => props.lotId],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.RetainSample.where('inspectionLotId', id).exec()
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { models: ['RetainSample'], initial: [] },
)

function openSample(id) {
  router.push(getCompanyPath(`/qc-inspection/retain-samples/${id}`))
}
</script>

<template>
  <BaseRailCard :title="`Retained Samples (${samples.length})`" :icon="IconArchive">
    <div class="tw:flex tw:flex-col tw:gap-2 tw:text-sm">
      <p v-if="samples.length === 0" class="tw:text-xs tw:text-secondary">
        No samples retained from this lot yet.
      </p>
      <BaseClickableRow
        v-for="s in samples"
        :key="s.id"
        class="tw:flex tw:items-center tw:justify-between tw:gap-2 tw:rounded tw:px-1.5 tw:py-1 tw:hover:bg-main-hover"
        :aria-label="`Open retain sample ${s.rsNumber}`"
        @click="openSample(s.id)"
      >
        <span class="tw:font-medium tw:text-primary">{{ s.rsNumber }}</span>
        <RetainSampleStatusBadgeById :statusId="s.statusId" :retainUntil="s.retainUntil" />
      </BaseClickableRow>
      <BaseButton v-if="canCreate" variant="outline" size="sm" class="tw:mt-1" @click="showCreate = true">
        <template #icon><IconPlus :size="14" /></template>
        Retain Sample
      </BaseButton>
    </div>

    <RetainSampleCreateDialog v-model="showCreate" :lotId="lotId" />
  </BaseRailCard>
</template>
