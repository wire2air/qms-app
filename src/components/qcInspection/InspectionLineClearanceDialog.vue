<script setup>
/**
 * Line clearance / sanitation checklist for a PRODUCTION LOT (batch) of an
 * in-process inspection — used to (re-)clear the active lot. Renders the
 * company's configured Line Clearance form (FormTemplate internalName
 * 'QC_LINE_CLEARANCE') via DynamicForm, then QA records a release decision:
 * Release (pass) or Hold (fail). A passed clearance unlocks collection.
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { IconCircleCheck, IconCircleX } from '@tabler/icons-vue'

const props = defineProps({
  lotId: { type: String, required: true },
  batchId: { type: String, default: null },
  // The active production lot (for prefill + label).
  batch: { type: Object, default: null },
})
const emit = defineEmits(['done'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(null) // 'PASSED' | 'FAILED' while submitting

const template = useLiveQuery(
  async (db) => (await db.FormTemplate.where().exec()).find((t) => t.internalName === 'QC_LINE_CLEARANCE') ?? null,
  { models: ['FormTemplate'], initial: undefined },
)
const schema = computed(() => template.value?.schema ?? [])
const formRef = ref(null)

const payload = ref({})
watch(show, (open) => {
  if (!open) return
  payload.value = props.batch?.lineClearancePayload ? JSON.parse(JSON.stringify(props.batch.lineClearancePayload)) : {}
})

const lotLabel = computed(() => props.batch?.lotNumber || 'this lot')

async function submit(decision) {
  if (saving.value || !props.batchId) return
  if (decision === 'PASSED' && formRef.value) {
    const ok = await formRef.value.validate()
    if (!ok) {
      toast.error('Complete the line clearance checklist before releasing the line.')
      return
    }
  }
  saving.value = decision
  try {
    await post(`/v1/services/qcInspection/lots/${props.lotId}/batches/${props.batchId}/line-clearance`, {
      payload: payload.value,
      decision,
    })
    toast.success(decision === 'PASSED' ? 'Line released — clearance passed' : 'Line held — clearance failed')
    show.value = false
    emit('done', decision)
  } catch (err) {
    toast.error(err?.message || 'Failed to record line clearance')
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <BaseDialog v-model="show" :title="`Line clearance — Lot ${lotLabel}`" maxWidth="lg">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <p class="tw:text-sm tw:text-secondary">
        Verify the line is clean, cleared of the previous run, and set up for this lot. You can't
        collect samples against it until the line is released.
      </p>

      <div v-if="template === undefined" class="tw:text-sm tw:text-secondary">Loading checklist…</div>
      <div
        v-else-if="!template"
        class="tw:rounded-lg tw:border tw:border-amber-200 tw:bg-amber-50 tw:px-4 tw:py-3 tw:text-sm tw:text-amber-900"
      >
        No line clearance checklist is configured. Set one up under
        <strong>QC Inspection → Line Clearance</strong>.
      </div>

      <DynamicForm v-else ref="formRef" v-model="payload" :fields="schema" />
    </div>

    <template #footer>
      <div class="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:px-5 tw:py-3">
        <BaseButton variant="ghost" @click="show = false">Cancel</BaseButton>
        <BaseButton
          variant="danger"
          :loading="saving === 'FAILED'"
          :disabled="!template || !batchId || !!saving"
          @click="submit('FAILED')"
        >
          <IconCircleX :size="16" /> Hold (fail)
        </BaseButton>
        <BaseButton
          variant="primary"
          :loading="saving === 'PASSED'"
          :disabled="!template || !batchId || !!saving"
          @click="submit('PASSED')"
        >
          <IconCircleCheck :size="16" /> Release (pass)
        </BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
