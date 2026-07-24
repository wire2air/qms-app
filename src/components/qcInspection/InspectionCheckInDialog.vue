<script setup>
/**
 * Inspector shift check-in. Confirms who's taking the inspection and captures
 * the shift + (in-process) the active production lot — select an existing lot or
 * add a new one. Becomes the active inspector; the chosen lot becomes active so
 * samples collect against it.
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const props = defineProps({
  lotId: { type: String, required: true },
  lot: { type: Object, default: null },
})
const emit = defineEmits(['done'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)

const isInProcess = computed(() => props.lot?.inspectionPoint === 'IN_PROCESS')
const isTakeover = computed(() => !!props.lot?.assignedTo)

const batches = useLiveQueryWithDeps(
  [() => props.lotId],
  async (db, [id]) =>
    db.InspectionBatch.where('inspectionLotId', id).orderBy('createdAt', 'asc').exec(),
  { models: ['InspectionBatch'], initial: [] },
)
const batchOptions = computed(() =>
  batches.value.map((b) => ({ id: b.id, label: b.lotNumber || `Lot ${b.id.slice(0, 6)}` })),
)

const shiftId = ref(null)
const lotMode = ref('new') // 'existing' | 'new'
const selectedBatchId = ref(null)
const newLotNumber = ref('')

watch(show, (open) => {
  if (!open) return
  shiftId.value = props.lot?.shiftId ?? null
  const hasBatches = batches.value.length > 0
  lotMode.value = hasBatches ? 'existing' : 'new'
  selectedBatchId.value = props.lot?.activeBatchId ?? batches.value[0]?.id ?? null
  newLotNumber.value = ''
})

const lotOk = computed(() =>
  !isInProcess.value ||
  (lotMode.value === 'new' ? newLotNumber.value.trim().length > 0 : !!selectedBatchId.value),
)
const canSubmit = computed(() => lotOk.value && !saving.value)

async function onSubmit() {
  if (!canSubmit.value) return
  saving.value = true
  try {
    // Become the active inspector (+ shift) first — batch actions require it.
    await post(`/v1/services/qcInspection/lots/${props.lotId}/check-in`, { shiftId: shiftId.value || null })
    if (isInProcess.value) {
      if (lotMode.value === 'new') {
        await post(`/v1/services/qcInspection/lots/${props.lotId}/batches`, {
          lotNumber: newLotNumber.value.trim(),
          shiftId: shiftId.value || null,
        })
      } else if (selectedBatchId.value) {
        await post(`/v1/services/qcInspection/lots/${props.lotId}/active-batch`, {
          batchId: selectedBatchId.value,
        })
      }
    }
    // Checking in begins the inspection for every type — there is no separate
    // Start action. Start a not-yet-started lot so the inspector can capture /
    // collect straight away.
    if (props.lot?.statusId === 'PENDING') {
      await post(`/v1/services/qcInspection/lots/${props.lotId}/start`, {})
    }
    toast.success('Checked in — inspection started; you are the inspector')
    show.value = false
    emit('done')
  } catch (err) {
    toast.error(err?.message || 'Check-in failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Check in" maxWidth="md">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <div
        v-if="isTakeover"
        class="tw:bg-amber-50 tw:border tw:border-amber-200 tw:rounded-lg tw:p-3 tw:text-sm tw:text-amber-900"
      >
        Another inspector is checked in — checking in will <strong>take over</strong> the inspection.
      </div>

      <BaseField label="Shift" required>
        <ShiftSelectMenu v-model="shiftId" />
      </BaseField>

      <template v-if="isInProcess">
        <BaseField label="Production lot" required hint="Samples you collect will be stamped with this Lot#.">
          <SegmentedControl
            v-model="lotMode"
            :options="[
              { label: 'Existing lot', value: 'existing' },
              { label: 'New lot', value: 'new' },
            ]"
            class="tw:mb-2"
          />
          <BaseSelect
            v-if="lotMode === 'existing'"
            v-model="selectedBatchId"
            :options="batchOptions"
            optionLabel="label"
            optionValue="id"
            :required="true"
            placeholder="Select production lot"
          />
          <BaseTextInput
            v-else
            v-model="newLotNumber"
            placeholder="New production lot / batch number"
          />
        </BaseField>
      </template>
    </div>

    <template #footer>
      <BaseDialogFooter
        :submitLabel="isTakeover ? 'Take over' : 'Check in'"
        :loading="saving"
        :disabled="!canSubmit"
        @cancel="show = false"
        @submit="onSubmit"
      />
    </template>
  </BaseDialog>
</template>
