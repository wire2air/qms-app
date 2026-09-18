<script setup>
/**
 * Per-sample comments + evidence. Works for any inspection type: the sample row
 * is created lazily on the server for batch (incoming/final) grids.
 *
 * Uses RichTextAttachments — rich text (bold/lists/inline images) plus file and
 * document attachments encoded into a single string, persisted to
 * inspection_samples.notes.
 */
import { patch } from '@/api' // Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.

const props = defineProps({
  lotId: { type: String, required: true },
  sampleNo: { type: Number, default: null },
  // The existing InspectionSample for this sampleNo, or null (lazy-created on save).
  sample: { type: Object, default: null },
  // [{ id, label }] production lots — enables reassigning a mis-collected sample.
  batchOptions: { type: Array, default: () => [] },
  readonly: { type: Boolean, default: false },
})
const emit = defineEmits(['saved'])
const show = defineModel({ type: Boolean, default: false })
const toast = useToast()
const saving = ref(false)

// Single encoded string: "<tiptap html>\n[qms-attachments]::[…]".
const content = ref('')
// Production lot the sample belongs to — editable to correct a wrong-lot collect.
const batchId = ref(null)
const canReassign = computed(() => !props.readonly && props.batchOptions.length > 1)

watch(show, (open) => {
  if (!open) return
  content.value = props.sample?.notes ?? ''
  batchId.value = props.sample?.batchId ?? null
})

async function onSave() {
  if (saving.value) return
  saving.value = true
  try {
    await patch(`/v1/services/qcInspection/lots/${props.lotId}/samples/${props.sampleNo}/evidence`, {
      notes: content.value || null,
      // Only send when the lot is known + reassignment is offered.
      ...(canReassign.value ? { batchId: batchId.value } : {}),
    })
    toast.success('Sample evidence saved')
    show.value = false
    emit('saved')
  } catch (err) {
    toast.error(err?.message || 'Failed to save')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog v-model="show" :title="`Sample #${sampleNo} — comments & evidence`" maxWidth="lg">
    <div class="tw:p-5 tw:flex tw:flex-col tw:gap-4">
      <!-- Correct a sample collected against the wrong production lot. -->
      <BaseField
        v-if="canReassign"
        label="Production lot (Lot#)"
        hint="Change this only to fix a sample collected under the wrong lot."
      >
        <BaseSelect
          v-model="batchId"
          :options="batchOptions"
          optionLabel="label"
          optionValue="id"
          optionDisabled="disabled"
          :required="true"
          placeholder="Select production lot"
        />
      </BaseField>

      <div class="tw:flex tw:flex-col tw:gap-2">
      <span class="tw:text-xs tw:font-medium tw:text-secondary">Comments &amp; evidence</span>
      <RichTextAttachments
        v-model="content"
        :readonly="readonly"
        placeholder="Observations for this sample — type notes, paste images, attach files or link a document…"
      />
      <p v-if="readonly && !content" class="tw:text-xs tw:text-secondary tw:italic">
        No comments or evidence recorded.
      </p>
      </div>
    </div>
    <template #footer>
      <BaseDialogFooter
        :submitLabel="readonly ? 'Close' : 'Save'"
        :loading="saving"
        @cancel="show = false"
        @submit="readonly ? (show = false) : onSave()"
      />
    </template>
  </BaseDialog>
</template>
