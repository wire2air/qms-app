<script setup>
/**
 * Collect sample units off the line for an in-process (IPQC) inspection. Each
 * collect appends N unit rows to the lot, server-stamped with the time + the
 * acting inspector, and tagged with the confirmed production lot (Lot#). The
 * count defaults to the sampling plan's per-collection guidance when set.
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const props = defineProps({
  lotId: { type: String, required: true },
  defaultCount: { type: Number, default: null },
  activeBatchId: { type: String, default: null },
  // [{ id, label }] production lots on this inspection.
  batchOptions: { type: Array, default: () => [] },
})
const emit = defineEmits(['collected', 'addLot'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)

const count = ref(1)
const notes = ref('')
// Confirmed target production lot — defaults to the active one so the inspector
// re-checks it before every collection (guards against collecting into the
// wrong lot after a shift/lot change).
const batchId = ref(null)

watch(show, (open) => {
  if (!open) return
  count.value = props.defaultCount && props.defaultCount > 0 ? props.defaultCount : 1
  notes.value = ''
  batchId.value = props.activeBatchId ?? props.batchOptions[0]?.id ?? null
})

const canSubmit = computed(() => Number(count.value) >= 1 && !!batchId.value && !saving.value)

async function onSubmit() {
  if (!canSubmit.value) return
  saving.value = true
  try {
    // Switch the active production lot first if the inspector changed it here,
    // so the collected samples are tagged with the confirmed Lot#.
    if (batchId.value !== props.activeBatchId) {
      await post(`/v1/services/qcInspection/lots/${props.lotId}/active-batch`, { batchId: batchId.value })
    }
    const { count: n } = await post(`/v1/services/qcInspection/lots/${props.lotId}/samples`, {
      count: Number(count.value),
      notes: notes.value.trim() || null,
    })
    toast.success(`Collected ${n} sample${n === 1 ? '' : 's'}`)
    show.value = false
    emit('collected')
  } catch (err) {
    toast.error(err?.message || 'Failed to collect samples')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Collect samples" maxWidth="sm">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <p class="tw:text-sm tw:text-secondary">
        Records the units pulled from the line now — stamped with the time and you as the
        inspector. Test each collected sample in the grid.
      </p>

      <!-- Confirm the production lot these samples belong to. -->
      <BaseField label="Production lot (Lot#)" required hint="Samples collected now are tagged with this Lot#.">
        <div class="tw:flex tw:items-center tw:gap-2">
          <BaseSelect
            v-model="batchId"
            :options="batchOptions"
            optionLabel="label"
            optionValue="id"
            optionDisabled="disabled"
            :required="true"
            placeholder="Select production lot"
            class="tw:flex-1"
          />
          <BaseButton variant="outline" size="sm" @click="emit('addLot')">+ Add Lot</BaseButton>
        </div>
      </BaseField>

      <BaseField label="Number collected" required>
        <BaseTextInput v-model.number="count" type="number" min="1" class="tw:w-32" />
      </BaseField>
      <BaseField label="Notes" optional>
        <BaseTextarea v-model="notes" :rows="2" placeholder="e.g. line 2, post-changeover" />
      </BaseField>
    </div>
    <template #footer>
      <BaseDialogFooter
        submitLabel="Collect"
        :loading="saving"
        :disabled="!canSubmit"
        @cancel="show = false"
        @submit="onSubmit"
      />
    </template>
  </BaseDialog>
</template>
