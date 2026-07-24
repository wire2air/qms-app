<script setup>
/**
 * Retain sample detail — identity, storage, dates, and the chain-of-custody
 * trail. Edits go through the PATCH action RPC (debounced save-on-change);
 * disposal is a separate e-signed action. Print Label opens the central
 * /print route (A4 label sheet by default).
 */
import { IconArchive, IconPrinter, IconFlameOff, IconArrowLeft } from '@tabler/icons-vue'
import { patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { isAllowed } from '@/utils/currentSession.js'

const props = defineProps({ id: { type: String, required: true } })

const toast = useToast()
const router = useRouter()

const sample = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => (id ? db.RetainSample.findByPk(id) : null),
  { models: ['RetainSample'] },
)
const lot = useLiveQueryWithDeps(
  [() => sample.value?.inspectionLotId],
  async (db, [id]) => (id ? db.InspectionLot.findByPk(id) : null),
  { models: ['InspectionLot'] },
)
const product = useLiveQueryWithDeps(
  [() => sample.value?.productId],
  async (db, [id]) => (id ? db.Product.findByPk(id) : null),
  { models: ['Product'] },
)
const events = useLiveQueryWithDeps(
  [() => props.id],
  async (db, [id]) => {
    if (!id) return []
    const rows = await db.RetainSampleEvent.where('retainSampleId', id).exec()
    return rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
  },
  { models: ['RetainSampleEvent'], initial: [] },
)
const locations = useLiveQuery(async (db) => db.StorageLocation.where().exec(), {
  models: ['StorageLocation'],
  initial: [],
})
const uoms = useLiveQuery(async (db) => db.Uom.where().exec(), { models: ['Uom'], initial: [] })
const locationName = (id) => locations.value.find((l) => l.id === id)?.name || null
const uomCode = (id) => uoms.value.find((u) => u.id === id)?.code || ''

const canUpdate = computed(() => isAllowed(['inspection_qc:create', 'inspection_qc:execute']))
const canDispose = computed(() => isAllowed(['inspection_qc:dispose']))
const isDisposed = computed(() => sample.value?.statusId === 'DISPOSED')
const editable = computed(() => canUpdate.value && !isDisposed.value)

// ── Edit form (PATCH action RPC; the model is read-mostly on the FE) ─────────
const TYPE_LABELS = { RESERVE: 'Reserve', REFERENCE: 'Reference', RETENTION: 'Retention' }
const form = ref(null)
const isSaving = ref(false)
const isFirstLoad = ref(true)

watch(
  sample,
  (s) => {
    if (!s) return
    if (!isFirstLoad.value) return
    isFirstLoad.value = false
    form.value = {
      sampleType: s.sampleType,
      quantity: s.quantity,
      uomId: s.uomId,
      storageLocationId: s.storageLocationId,
      position: s.position ?? '',
      storageConditions: s.storageConditions ?? '',
      retainUntil: s.retainUntil?.isValid ? s.retainUntil.toFormat('yyyy-MM-dd') : '',
      sealState: s.sealState,
      notes: s.notes ?? '',
    }
  },
  { immediate: true },
)

const debouncedSave = useDebounceFn(async () => {
  if (!form.value || !editable.value) return
  isSaving.value = true
  try {
    await patch(`/v1/services/qcInspection/retainSamples/${props.id}`, {
      sampleType: form.value.sampleType,
      quantity: form.value.quantity != null && form.value.quantity !== '' ? Number(form.value.quantity) : null,
      uomId: form.value.uomId || null,
      storageLocationId: form.value.storageLocationId || null,
      position: form.value.position?.trim() || null,
      storageConditions: form.value.storageConditions?.trim() || null,
      retainUntil: form.value.retainUntil || null,
      sealState: form.value.sealState,
      notes: form.value.notes?.trim() || null,
    })
  } catch (err) {
    toast.error(err?.message || 'Failed to save')
  } finally {
    isSaving.value = false
  }
}, 600)

watch(
  form,
  () => {
    if (!isFirstLoad.value && form.value) debouncedSave()
  },
  { deep: true },
)

// ── Actions ──────────────────────────────────────────────────────────────────
const showDispose = ref(false)

function openLabelPrint() {
  window.open(getCompanyPath(`/print?module=RetainSampleLabel&id=${props.id}`), '_blank')
}
function backToLot() {
  if (sample.value?.inspectionLotId) {
    router.push(getCompanyPath(`/qc-inspection/lots/${sample.value.inspectionLotId}`))
  } else {
    router.push(getCompanyPath('/qc-inspection?tab=retain-samples'))
  }
}

const EVENT_LABELS = {
  CREATED: 'Sample retained',
  MOVED: 'Moved',
  WITHDRAWN: 'Quantity withdrawn',
  EXAMINED: 'Examined',
  SEAL_BROKEN: 'Seal broken',
  DISPOSED: 'Disposed',
}
function eventDetail(e) {
  const parts = []
  if (e.eventType === 'MOVED') {
    const from = locationName(e.fromLocationId)
    const to = locationName(e.toLocationId)
    if (from || to) parts.push(`${from ?? '—'} → ${to ?? '—'}`)
  } else if (e.toLocationId && e.eventType === 'CREATED') {
    const to = locationName(e.toLocationId)
    if (to) parts.push(`Stored in ${to}`)
  }
  if (e.quantityDelta != null) parts.push(`Δ ${e.quantityDelta}`)
  if (e.reason) parts.push(e.reason)
  if (e.notes) parts.push(e.notes)
  return parts.join(' · ')
}
</script>

<template>
  <BasePage width="narrow">
    <PageHeader
      :icon="IconArchive"
      :title="sample ? `Retain Sample ${sample.rsNumber}` : 'Retain Sample'"
    >
      <template #actions>
        <div class="tw:flex tw:items-center tw:gap-2">
          <span v-if="isSaving" class="tw:text-xs tw:text-secondary">Saving…</span>
          <BaseButton variant="ghost" size="sm" @click="backToLot">
            <template #icon><IconArrowLeft :size="16" /></template>
            {{ lot ? lot.lotNumber : 'Back' }}
          </BaseButton>
          <BaseButton variant="outline" size="sm" @click="openLabelPrint">
            <template #icon><IconPrinter :size="16" /></template>
            Print Label
          </BaseButton>
          <BaseButton
            v-if="canDispose && !isDisposed"
            variant="outline"
            size="sm"
            @click="showDispose = true"
          >
            <template #icon><IconFlameOff :size="16" /></template>
            Record Disposal
          </BaseButton>
        </div>
      </template>
    </PageHeader>

    <div v-if="!sample" class="tw:text-sm tw:text-secondary">Loading…</div>

    <template v-else>
      <!-- Status strip -->
      <div class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
        <RetainSampleStatusBadgeById :statusId="sample.statusId" :retainUntil="sample.retainUntil" />
        <span class="tw:text-sm tw:text-secondary">
          {{ product?.name || '—' }} · Lot {{ sample.lotNumber || '—' }}
          <template v-if="sample.batchNumber"> · Batch {{ sample.batchNumber }}</template>
        </span>
      </div>

      <div
        v-if="isDisposed"
        class="tw:rounded-lg tw:border tw:border-divider tw:bg-main-hover tw:px-4 tw:py-3 tw:text-sm"
      >
        <span class="tw:font-semibold">Disposed</span>
        <span class="tw:text-secondary">
          — {{ sample.disposedAt ? sample.disposedAt.formatDate('date') : '' }}
          <template v-if="sample.disposalMethod"> · {{ sample.disposalMethod }}</template>
          <template v-if="sample.disposalNotes"> · {{ sample.disposalNotes }}</template>
        </span>
        <UserBadgeById v-if="sample.disposedById" :userId="sample.disposedById" class="tw:ml-2" />
      </div>

      <!-- Sample + storage -->
      <PageSection title="Sample">
        <div v-if="form" class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-4">
          <BaseField v-slot="{ id: fieldId }" label="Sample type">
            <select
              :id="fieldId"
              v-model="form.sampleType"
              :disabled="!editable"
              class="tw:w-full tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            >
              <option v-for="(label, value) in TYPE_LABELS" :key="value" :value="value">{{ label }}</option>
            </select>
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Quantity">
            <div class="tw:flex tw:items-center tw:gap-2">
              <input
                :id="fieldId"
                v-model.number="form.quantity"
                type="number"
                min="0"
                step="any"
                :disabled="!editable"
                class="tw:w-32 tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
              />
              <span class="tw:text-sm tw:text-secondary">{{ uomCode(form.uomId) }}</span>
            </div>
          </BaseField>
          <BaseField label="Storage location">
            <StorageLocationSelectMenu v-if="editable" v-model="form.storageLocationId" />
            <span v-else class="tw:text-sm tw:text-on-main">
              {{ locationName(sample.storageLocationId) || '—' }}
            </span>
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Position" hint="Shelf / box / slot.">
            <BaseTextInput :id="fieldId" v-model="form.position" :disabled="!editable" />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Storage conditions">
            <BaseTextInput
              :id="fieldId"
              v-model="form.storageConditions"
              :disabled="!editable"
              placeholder="e.g. 2–8 °C"
            />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Retain until">
            <input
              :id="fieldId"
              v-model="form.retainUntil"
              type="date"
              :disabled="!editable"
              class="tw:w-44 tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            />
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Seal">
            <select
              :id="fieldId"
              v-model="form.sealState"
              :disabled="!editable"
              class="tw:w-40 tw:rounded tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-1.5 tw:text-sm"
            >
              <option value="SEALED">Sealed</option>
              <option value="OPENED">Opened</option>
            </select>
          </BaseField>
          <BaseField v-slot="{ id: fieldId }" label="Notes" class="tw:md:col-span-2">
            <BaseTextarea :id="fieldId" v-model="form.notes" :rows="2" :disabled="!editable" />
          </BaseField>
        </div>
      </PageSection>

      <!-- Traceability -->
      <PageSection title="Traceability">
        <dl class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-x-8 tw:gap-y-2 tw:text-sm">
          <div class="tw:flex tw:justify-between tw:gap-3">
            <dt class="tw:text-secondary">Source inspection</dt>
            <dd>
              <BaseClickableRow
                class="tw:text-primary tw:font-medium"
                :aria-label="`Open inspection ${lot?.lotNumber || ''}`"
                @click="backToLot"
              >
                {{ lot?.lotNumber || '—' }}
              </BaseClickableRow>
            </dd>
          </div>
          <div class="tw:flex tw:justify-between tw:gap-3">
            <dt class="tw:text-secondary">Retained</dt>
            <dd class="tw:text-on-main">
              {{ sample.retainedAt ? sample.retainedAt.formatDate('date') : '—' }}
              <UserBadgeById v-if="sample.retainedById" :userId="sample.retainedById" class="tw:ml-1" />
            </dd>
          </div>
          <div class="tw:flex tw:justify-between tw:gap-3">
            <dt class="tw:text-secondary">Manufacturing date</dt>
            <dd class="tw:text-on-main">
              {{ sample.manufacturingDate ? sample.manufacturingDate.formatDate('date') : '—' }}
            </dd>
          </div>
          <div class="tw:flex tw:justify-between tw:gap-3">
            <dt class="tw:text-secondary">Expiry date</dt>
            <dd class="tw:text-on-main">
              {{ sample.expiryDate ? sample.expiryDate.formatDate('date') : '—' }}
            </dd>
          </div>
        </dl>
      </PageSection>

      <!-- Chain of custody -->
      <PageSection title="Chain of Custody">
        <ol class="tw:flex tw:flex-col tw:gap-3">
          <li v-for="e in events" :key="e.id" class="tw:flex tw:items-start tw:gap-3 tw:text-sm">
            <span class="tw:mt-1.5 tw:size-2 tw:rounded-full tw:bg-primary tw:shrink-0" />
            <div class="tw:flex tw:flex-col tw:gap-0.5 tw:min-w-0">
              <div class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
                <span class="tw:font-medium tw:text-on-main">
                  {{ EVENT_LABELS[e.eventType] || e.eventType }}
                </span>
                <span class="tw:text-xs tw:text-secondary">
                  {{ e.createdAt ? e.createdAt.formatDate('datetime') : '' }}
                </span>
                <UserBadgeById v-if="e.actorUserId" :userId="e.actorUserId" />
              </div>
              <span v-if="eventDetail(e)" class="tw:text-secondary">{{ eventDetail(e) }}</span>
            </div>
          </li>
          <li v-if="events.length === 0" class="tw:text-sm tw:text-secondary">No events yet.</li>
        </ol>
      </PageSection>
    </template>

    <RetainSampleDisposeDialog
      v-model="showDispose"
      :sampleId="props.id"
      :rsNumber="sample?.rsNumber || ''"
    />
  </BasePage>
</template>
