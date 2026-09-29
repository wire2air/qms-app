<script setup>
import { IconArchive, IconAlertTriangle } from '@tabler/icons-vue'
import { useDocuments } from '@/composables/useDocuments.js'

/**
 * Confirms whole-document obsoletion: captures the required reason, then the
 * e-signature.
 *
 * Obsoleting (archiving) a controlled document is a regulated event under
 * ISO 9001 / 13485 — auditors need the reason recorded. Common reasons:
 *   - Superseded by an external standard or document
 *   - Regulation or scope removed
 *   - Process discontinued
 *   - Replaced by another internal SOP
 *
 * WHAT THIS USED TO DO, AND WHY IT CHANGED. It stamped obsoletedAt /
 * obsoletedBy / obsoletionReason on the document and then SOFT-DELETED it. The
 * syncEngine excludes soft-deleted rows from where(), so an archived document
 * left the register completely: the Archived view could never populate, and the
 * `statusId !== 'ARCHIVED'` read-only gates written across the document UI never
 * fired, because the delete was the only thing hiding the row.
 *
 * It is now a status transition performed server-side (POST .../archive), which
 * is also what lets the e-signature be verified — a PIN cannot be checked in the
 * browser. Versions are left untouched by design; see
 * controllers/documents/archive.js for why (the short version: both permission
 * arms of documents_sel require an EFFECTIVE version, so archiving the versions
 * would re-hide the document through RLS instead).
 *
 * A document that has never been effective cannot reach this dialog — there is
 * nothing to withdraw, so those are discarded instead. The server enforces that
 * too, with a 409.
 */

const props = defineProps({
  document: { type: Object, default: null },
  documentTitle: { type: String, default: '' },
  documentNumber: { type: String, default: '' },
})

const emit = defineEmits(['archived'])

const show = defineModel({ type: Boolean, default: false })

const { archiveDocument } = useDocuments()

const reason = ref('')
const saving = ref(false)
const error = ref(null)
const submitted = ref(false)
const showEsign = ref(false)

watch(show, (open) => {
  if (open) {
    reason.value = ''
    error.value = null
    submitted.value = false
    showEsign.value = false
  }
})

const reasonError = computed(() => {
  if (!submitted.value) return null
  const text = reason.value?.trim()
  if (!text) return 'Reason for obsoletion is required.'
  if (text.length < 10) return 'Please add a few more words for the audit trail.'
  return null
})

// Reason first, then the signature — the author sees exactly what they are
// about to sign for before being asked for a PIN.
function confirm() {
  submitted.value = true
  if (reasonError.value || !props.document) return
  error.value = null
  showEsign.value = true
}

async function onEsignVerified({ method, token }) {
  if (saving.value || !props.document) return
  saving.value = true
  error.value = null
  try {
    await archiveDocument(props.document.id, {
      method,
      token,
      reason: reason.value.trim(),
    })
    showEsign.value = false
    emit('archived')
    show.value = false
  } catch (e) {
    // Keep the reason dialog open so the text isn't lost on a failed signature.
    showEsign.value = false
    error.value = e?.message || 'Failed to archive document.'
  } finally {
    saving.value = false
  }
}

function cancel() {
  show.value = false
}
</script>

<template>
  <BaseDialog v-model="show" maxWidth="lg">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:bg-red-50 tw:text-red-600 tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconArchive :size="22" />
        </div>
        <div>
          <div class="tw:text-lg tw:font-bold tw:text-on-main">Archive Document</div>
          <div
            v-if="documentTitle || documentNumber"
            class="tw:text-xs tw:text-secondary tw:mt-0.5"
          >
            {{ documentNumber }} — {{ documentTitle }}
          </div>
        </div>
      </div>
    </template>

    <div class="tw:flex tw:flex-col tw:gap-4">
      <div
        class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-amber-50 tw:border tw:border-amber-200 tw:text-amber-900 tw:text-xs"
      >
        <IconAlertTriangle :size="16" class="tw:mt-0.5 tw:flex-none" />
        <div>
          Archiving a controlled document is a regulated event, so you'll be asked to sign next.
          The reason below is recorded on the audit trail and shown on every print copy. The
          document stays on the register and its versions remain readable — it becomes read-only
          and can't be revised further.
        </div>
      </div>

      <BaseField v-slot="{ id: fieldId }" label="Reason for obsoletion" required>
        <BaseTextarea
          :id="fieldId"
          v-model="reason"
          :rows="4"
          placeholder="e.g. Superseded by SOP-NEW-104. Calibration procedure no longer applies — ISO 17025 clause 6.4.7 changed."
        />
        <p v-if="reasonError" class="tw:text-xs tw:text-red-600">{{ reasonError }}</p>
      </BaseField>

      <div
        v-if="error"
        class="tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-800 tw:text-xs"
      >
        {{ error }}
      </div>
    </div>

    <template #footer>
      <BaseDialogFooter
        submitLabel="Continue"
        submitVariant="danger"
        :loading="saving"
        @cancel="cancel"
        @submit="confirm"
      />
    </template>
  </BaseDialog>

  <WorkflowInstanceEsignAuthDialog v-model="showEsign" @verified="onEsignVerified" />
</template>
