<script setup>
/**
 * Add a production lot (batch) to an in-process QC inspection. A new production
 * lot is a line changeover, so the line clearance / sanitation checklist is
 * captured here: the lot is added with a QA release decision (Release = pass /
 * Hold = fail). The new lot becomes active; you can't collect against it until
 * its clearance passes (when the company requires clearance).
 */
import { post } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { IconCircleCheck, IconCircleX } from '@tabler/icons-vue'
import { unansweredClearanceRows } from '@/utils/lineClearance.js'

const props = defineProps({
  lotId: { type: String, required: true },
  defaultShiftId: { type: String, default: null },
})
const emit = defineEmits(['added'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(null) // 'PASSED' | 'FAILED' | 'PLAIN' while submitting

const lotNumber = ref('')
const shiftId = ref(null)
const clearancePayload = ref({})
const checklistRef = ref(null)

// The company's Line Clearance checklist (if configured).
const template = useLiveQuery(
  async (db) => (await db.FormTemplate.where().exec()).find((t) => t.internalName === 'QC_LINE_CLEARANCE') ?? null,
  { models: ['FormTemplate'], initial: undefined },
)
const schema = computed(() => template.value?.schema ?? [])
const hasChecklist = computed(() => !!template.value)

watch(show, (open) => {
  if (!open) return
  lotNumber.value = ''
  shiftId.value = props.defaultShiftId ?? null
  clearancePayload.value = {}
})

const lotOk = computed(() => lotNumber.value.trim().length > 0)

async function submit(decision) {
  if (saving.value || !lotOk.value) return
  // Releasing (pass) requires every checklist item to be answered.
  if (decision === 'PASSED' && hasChecklist.value) {
    if (checklistRef.value) await checklistRef.value.validate()
    const missing = unansweredClearanceRows(schema.value, clearancePayload.value)
    if (missing.length) {
      toast.error(`Answer all clearance items before releasing the line (${missing.length} remaining).`)
      return
    }
  }
  saving.value = decision || 'PLAIN'
  try {
    await post(`/v1/services/qcInspection/lots/${props.lotId}/batches`, {
      lotNumber: lotNumber.value.trim(),
      shiftId: shiftId.value || null,
      ...(decision ? { clearancePayload: clearancePayload.value, clearanceDecision: decision } : {}),
    })
    toast.success(
      decision === 'PASSED'
        ? 'Lot added — line released'
        : decision === 'FAILED'
          ? 'Lot added — line on hold'
          : 'Production lot added',
    )
    show.value = false
    emit('added')
  } catch (err) {
    toast.error(err?.message || 'Failed to add production lot')
  } finally {
    saving.value = null
  }
}
</script>

<template>
  <BaseDialog v-model="show" title="Add production lot" :maxWidth="hasChecklist ? '3xl' : 'sm'">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <p class="tw:text-sm tw:text-secondary">
        The new production lot becomes the active one — samples you collect next are stamped with
        its Lot#.
      </p>
      <div class="tw:grid tw:grid-cols-2 tw:gap-3">
        <BaseField label="Lot #" required>
          <BaseTextInput v-model="lotNumber" placeholder="Production batch / lot number" />
        </BaseField>
        <BaseField label="Shift" optional>
          <ShiftSelectMenu v-model="shiftId" />
        </BaseField>
      </div>

      <!-- Line clearance for this new lot (line changeover). -->
      <div v-if="hasChecklist" class="tw:border-t tw:border-divider tw:pt-4">
        <div class="tw:text-sm tw:font-semibold tw:text-on-main tw:mb-1">Line clearance</div>
        <p class="tw:text-xs tw:text-secondary tw:mb-3">
          Confirm the line is clean and cleared of the previous run before releasing it for this lot.
        </p>
        <DynamicForm ref="checklistRef" v-model="clearancePayload" :fields="schema" />
      </div>
    </div>

    <template #footer>
      <div class="tw:flex tw:items-center tw:justify-end tw:gap-2 tw:px-5 tw:py-3">
        <BaseButton variant="ghost" @click="show = false">Cancel</BaseButton>
        <template v-if="hasChecklist">
          <BaseButton
            variant="danger"
            :loading="saving === 'FAILED'"
            :disabled="!lotOk || !!saving"
            @click="submit('FAILED')"
          >
            <IconCircleX :size="16" /> Add &amp; hold
          </BaseButton>
          <BaseButton
            variant="primary"
            :loading="saving === 'PASSED'"
            :disabled="!lotOk || !!saving"
            @click="submit('PASSED')"
          >
            <IconCircleCheck :size="16" /> Add &amp; release
          </BaseButton>
        </template>
        <BaseButton
          v-else
          variant="primary"
          :loading="saving === 'PLAIN'"
          :disabled="!lotOk || !!saving"
          @click="submit(null)"
        >
          Add lot
        </BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>
