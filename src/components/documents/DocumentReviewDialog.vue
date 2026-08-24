<script setup>
/**
 * Complete a periodic review as an attested decision.
 *
 * Replaces the one-click "Mark Reviewed": outcome, justification, then a PIN
 * signature — because a review that restarts a compliance clock is a signed
 * decision, not a button. The "no change required" outcome REQUIRES the
 * justification: it is the outcome with nothing else to show for it, so the
 * review is the record.
 *
 * REVISION and OBSOLETE record intent only — the revision and the obsoletion
 * run through their own controlled flows afterwards, and this dialog says so
 * rather than implying it did them.
 */
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post } from '@/api'

const props = defineProps({
  documentId: { type: String, required: true },
  documentLabel: { type: String, default: 'this document' },
})

const emit = defineEmits(['completed'])
const open = defineModel({ type: Boolean, default: false })
const toast = useToast()
const outcome = ref('NO_CHANGE')
const justification = ref('')
const submitting = ref(false)
const showEsign = ref(false)

const OUTCOMES = [
  {
    value: 'NO_CHANGE',
    label: 'No change required',
    hint: 'The document is current as written. Restarts the review clock.',
  },
  {
    value: 'REVISION',
    label: 'Revision required',
    hint: 'Records the verdict — then create the new version; its approval restarts the clock.',
  },
  {
    value: 'OBSOLETE',
    label: 'Should be obsoleted',
    hint: 'Records the proposal — obsoletion itself runs through its own flow.',
  },
]

const justificationFilled = computed(
  () =>
    !!justification.value
      .replace(/<[^>]+>/g, ' ')
      .trim(),
)

const canSign = computed(() => outcome.value !== 'NO_CHANGE' || justificationFilled.value)

function requestSignature() {
  if (!canSign.value) return
  showEsign.value = true
}

async function onEsignVerified(esign) {
  submitting.value = true
  try {
    await post(
      `/v1/services/documents/${props.documentId}/review`,
      { outcome: outcome.value, justification: justification.value || null, esign },
      { showError: true },
    )
    toast.success('Review recorded and signed.')
    open.value = false
    outcome.value = 'NO_CHANGE'
    justification.value = ''
    emit('completed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Complete periodic review" size="lg">
    <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
      <BaseText color="secondary" class="tw:text-sm">
        Your decision on {{ props.documentLabel }} is recorded with your e-signature and kept as
        review history.
      </BaseText>

      <div class="tw:flex tw:flex-col tw:gap-2">
        <BaseClickableRow
          v-for="o in OUTCOMES"
          :key="o.value"
          :aria-label="o.label"
          class="tw:flex tw:items-start tw:gap-3 tw:rounded-lg tw:border tw:p-3"
          :class="
            outcome === o.value
              ? 'tw:border-primary tw:bg-primary/5'
              : 'tw:border-divider tw:hover:border-primary/50'
          "
          @click="outcome = o.value"
        >
          <span
            class="tw:mt-0.5 tw:size-4 tw:shrink-0 tw:rounded-full tw:border-2"
            :class="outcome === o.value ? 'tw:border-primary tw:bg-primary' : 'tw:border-divider'"
          />
          <span class="tw:flex tw:flex-col">
            <span class="tw:text-sm tw:font-medium tw:text-on-main">{{ o.label }}</span>
            <span class="tw:text-xs tw:text-secondary">{{ o.hint }}</span>
          </span>
        </BaseClickableRow>
      </div>

      <BaseField
        label="Justification"
        :required="outcome === 'NO_CHANGE'"
        :hint="
          outcome === 'NO_CHANGE'
            ? 'Required — this review is the only record that the document was looked at and held up.'
            : 'Optional context for the decision.'
        "
      >
        <BaseRichTextEditor
          v-model="justification"
          placeholder="What was checked, and why this outcome…"
        />
      </BaseField>
    </div>

    <template #footer>
      <div class="tw:flex tw:w-full tw:items-center tw:justify-end tw:gap-2">
        <BaseButton variant="outline" :disabled="submitting" @click="open = false">
          Cancel
        </BaseButton>
        <BaseButton
          variant="primary"
          :isLoading="submitting"
          :disabled="!canSign"
          :title="canSign ? '' : 'A justification is required when no change is made'"
          @click="requestSignature"
        >
          Sign &amp; record review
        </BaseButton>
      </div>
    </template>
  </BaseDialog>

  <WorkflowInstanceEsignAuthDialog v-model="showEsign" @verified="onEsignVerified" />
</template>
