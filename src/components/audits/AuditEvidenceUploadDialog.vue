<script setup>
/**
 * File-upload dialog for audit evidence.
 *
 * Scope flexibility — props.scope picks which FK the resulting
 * audit_evidence row gets:
 *   - 'audit'    → auditInstanceId only (general audit evidence)
 *   - 'finding'  → +auditFindingId
 *   - 'response' → +auditRequirementResponseId
 *
 * Multipart POST mirrors the supplier-document upload flow; the BE
 * (uploadAuditEvidence) parses the file via uploadMiddleware, stages
 * to object storage via uploadFile + saveAssetToDatabase, then binds
 * the asset to the audit through audit_evidence.
 */
import { IconCamera } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { upload } from '@/api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  auditInstanceId: { type: String, required: true },
  // Optional scope: when provided the evidence is scoped to a
  // requirement response or finding. Both null = audit-overall.
  scope: { type: String, default: 'audit' }, // 'audit' | 'finding' | 'response'
  scopeId: { type: String, default: null },
})
const emit = defineEmits(['update:modelValue', 'uploaded'])

const toast = useToast()
const file = ref(null)
const caption = ref('')
const uploading = ref(false)
// Hidden camera input — `capture` opens the rear camera on mobile/iPad so the
// auditor can photograph evidence during the walkthrough. On desktop the
// attribute is ignored and it behaves as a normal file picker.
const cameraInputRef = ref(null)

// Title reflects the scope so it's clear which upload path fired.
const dialogTitle = computed(() =>
  props.scope === 'documentRequest' ? 'Upload Requested Document' : 'Upload Evidence',
)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      file.value = null
      caption.value = ''
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

function pickFile(e) {
  file.value = e.target.files?.[0] || null
}

const canUpload = computed(() => !!file.value && !uploading.value)

async function handleUpload() {
  if (!canUpload.value) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file.value)
    fd.append('auditInstanceId', props.auditInstanceId)
    if (props.scope === 'finding' && props.scopeId) {
      fd.append('auditFindingId', props.scopeId)
    } else if (props.scope === 'response' && props.scopeId) {
      fd.append('auditRequirementResponseId', props.scopeId)
    } else if (props.scope === 'documentRequest' && props.scopeId) {
      fd.append('auditDocumentRequestId', props.scopeId)
    }
    if (caption.value.trim()) fd.append('caption', caption.value.trim())
    await upload('/v1/services/auditEvidence', fd)
    toast.success('Evidence uploaded')
    emit('uploaded')
    close()
  } catch (err) {
    toast.error(err?.message || 'Upload failed')
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <BaseDialog :modelValue="modelValue" :title="dialogTitle" maxWidth="md" @update:modelValue="close">
    <div class="tw:flex tw:flex-col tw:gap-3 tw:p-1">
      <BaseField v-slot="{ id: fieldId }" label="File" required>
        <input
          :id="fieldId"
          type="file"
          class="tw:block tw:w-full tw:text-sm tw:text-secondary tw:file:mr-3 tw:file:py-1.5 tw:file:px-3 tw:file:rounded tw:file:border-0 tw:file:bg-primary tw:file:text-white tw:file:font-semibold tw:file:cursor-pointer tw:file:hover:bg-primary/90"
          @change="pickFile"
        />
        <!-- Take Photo — opens the device camera on mobile/iPad. -->
        <input
          ref="cameraInputRef"
          type="file"
          accept="image/*"
          capture="environment"
          class="tw:hidden"
          @change="pickFile"
        />
        <button
          type="button"
          class="tw:mt-2 tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:font-medium tw:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer"
          @click="cameraInputRef?.click()"
        >
          <IconCamera :size="15" /> Take Photo
        </button>
        <p
          v-if="file"
          class="tw:text-[11px] tw:text-secondary tw:mt-1"
        >
          {{ file.name }} · {{ Math.round(file.size / 1024) }} KB
        </p>
      </BaseField>
      <BaseField v-slot="{ id: fieldId }" label="Caption">
        <BaseTextarea
          :id="fieldId"
          v-model="caption"
          :rows="2"
          placeholder="What does this evidence show?"
        />
      </BaseField>
    </div>
    <template #footer>
      <BaseButton variant="outline" :disabled="uploading" @click="close">Cancel</BaseButton>
      <BaseButton
        variant="primary"
        :loading="uploading"
        :disabled="!canUpload"
        @click="handleUpload"
      >
        Upload
      </BaseButton>
    </template>
  </BaseDialog>
</template>
