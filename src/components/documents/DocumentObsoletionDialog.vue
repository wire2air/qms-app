<script setup>
import { DateTime } from 'luxon'
import { IconArchive, IconAlertTriangle } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'

/**
 * Confirms whole-document obsoletion + captures the required reason.
 *
 * Obsoleting (archiving) a controlled document is a regulated event under
 * ISO 9001 / 13485 — auditors need the reason recorded. Common reasons:
 *   - Superseded by an external standard or document
 *   - Regulation or scope removed
 *   - Process discontinued
 *   - Replaced by another internal SOP
 *
 * On confirm: stamps obsoletedAt / obsoletedBy / obsoletionReason on the
 * document, then soft-deletes it. The DB CHECK constraint rejects an
 * obsoletedAt without a reason — the textarea is required client-side too.
 */

const props = defineProps({
  document: { type: Object, default: null },
  documentTitle: { type: String, default: '' },
  documentNumber: { type: String, default: '' },
})

const emit = defineEmits(['archived'])

const show = defineModel({ type: Boolean, default: false })

const reason = ref('')
const saving = ref(false)
const error = ref(null)
const submitted = ref(false)

watch(show, (open) => {
  if (open) {
    reason.value = ''
    error.value = null
    submitted.value = false
  }
})

const reasonError = computed(() => {
  if (!submitted.value) return null
  const text = reason.value?.trim()
  if (!text) return 'Reason for obsoletion is required.'
  if (text.length < 10) return 'Please add a few more words for the audit trail.'
  return null
})

async function confirm() {
  submitted.value = true
  if (reasonError.value || !props.document) return
  saving.value = true
  error.value = null
  try {
    props.document.obsoletedAt = DateTime.now()
    props.document.obsoletedBy = currentSession.value?.userId || null
    props.document.obsoletionReason = reason.value.trim()
    await props.document.save()
    // Soft-delete after stamping so the audit-log row carries the
    // obsoletion reason in the snapshot.
    await props.document.delete()
    emit('archived')
    show.value = false
  } catch (e) {
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
          <div v-if="documentTitle || documentNumber" class="tw:text-xs tw:text-secondary tw:mt-0.5">
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
          Archiving a controlled document is a regulated event. The reason below is recorded on the
          audit trail and shown on every print copy. Existing versions remain readable but the
          document can't be revised further.
        </div>
      </div>

      <div class="tw:flex tw:flex-col tw:gap-1.5">
        <label class="tw:text-sm tw:font-medium tw:text-on-main">
          Reason for obsoletion <span class="tw:text-red-600">*</span>
        </label>
        <BaseTextarea
          v-model="reason"
          data-testid="document-obsoletion-reason"
          :rows="4"
          placeholder="e.g. Superseded by SOP-NEW-104. Calibration procedure no longer applies — ISO 17025 clause 6.4.7 changed."
        />
        <p v-if="reasonError" class="tw:text-xs tw:text-red-600">{{ reasonError }}</p>
      </div>

      <div
        v-if="error"
        class="tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-800 tw:text-xs"
      >
        {{ error }}
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" :disabled="saving" @click="cancel">Cancel</BaseButton>
      <BaseButton
        variant="danger"
        data-testid="document-obsoletion-confirm"
        :disabled="saving"
        @click="confirm"
      >
        {{ saving ? 'Archiving…' : 'Archive Document' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
