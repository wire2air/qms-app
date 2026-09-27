<script setup>
/**
 * Move who verifies THIS training instance.
 *
 * Competency verification is manager-only, deliberately: the record says a
 * NAMED person attested to this trainee's competence. That makes it a control
 * rather than an obstacle — so when the named manager is away, or is
 * themselves a trainee, the answer is to move the accountability, not to widen
 * who may attest.
 *
 * Writes `training_instances.manager_id`, which verification already consults
 * ahead of the training template's manager. Scoped to this instance: the
 * template keeps its manager, so future launches are unaffected and a stand-in
 * for one cohort does not quietly become the permanent verifier.
 */
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception. The response
// is an outcome plus an advisory warning, not a synced record.
import { post } from '@/api'

const props = defineProps({
  instanceId: { type: String, required: true },
  /** Excluded from the picker — they cannot verify their own training. */
  traineeUserIds: { type: Array, default: () => [] },
  currentManagerId: { type: String, default: null },
})

const emit = defineEmits(['reassigned'])
const isOpen = defineModel({ type: Boolean, default: false })

const toast = useToast()
const managerId = ref(null)
const submitting = ref(false)
const saveError = ref('')
// Non-blocking: the new manager was set, but cannot open the page yet.
const accessWarning = ref('')

watch(isOpen, (open) => {
  if (!open) return
  managerId.value = props.currentManagerId ?? null
  saveError.value = ''
  accessWarning.value = ''
})

// Picking a trainee would produce an instance nobody can sign off, and the
// refusal would not arrive until they tried. The server refuses it too.
const isTrainee = computed(() => props.traineeUserIds.includes(managerId.value))
const canSubmit = computed(
  () => !!managerId.value && !isTrainee.value && managerId.value !== props.currentManagerId,
)

async function submit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  saveError.value = ''
  accessWarning.value = ''
  try {
    const { warning } = await post(
      `/v1/services/trainingInstances/${props.instanceId}/reassign-manager`,
      { managerId: managerId.value },
    )
    emit('reassigned')
    if (warning) {
      // Held on screen rather than toasted: it asks for a follow-up action by
      // someone who may not be in this room, and a toast disappears.
      accessWarning.value = warning
      toast.success('Verifier reassigned — see the note below')
    } else {
      toast.success('Verifier reassigned')
      isOpen.value = false
    }
  } catch (e) {
    saveError.value = e?.message || 'Could not reassign the verifier'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="isOpen" title="Reassign verifier" size="md">
    <div class="tw:flex tw:flex-col tw:gap-4">
      <BaseCaption>
        Competency verification is done by one named person. Reassigning applies to
        <strong>this training instance only</strong> — the training itself keeps its manager, so
        future launches are unaffected.
      </BaseCaption>

      <BaseField label="New verifier">
        <UserSelectMenu v-model="managerId" nullLabel="Select a person" />
      </BaseField>

      <BaseErrorText v-if="isTrainee">
        That person is a trainee on this instance. Competency verification has to be done by someone
        other than the trainee, so they could never sign it off.
      </BaseErrorText>

      <div
        v-if="accessWarning"
        class="tw:border tw:border-amber-200 tw:bg-amber-50/60 tw:rounded-lg tw:p-3 tw:text-sm tw:text-amber-800"
      >
        {{ accessWarning }}
      </div>
    </div>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Reassign"
        :loading="submitting"
        :disabled="!canSubmit"
        :submitTitle="
          isTrainee ? 'A trainee on this instance cannot verify their own training' : undefined
        "
        :error="saveError"
        @cancel="isOpen = false"
        @submit="submit"
      />
    </template>
  </BaseDialog>
</template>
