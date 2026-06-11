<script setup>
/**
 * Voice notes for an audit clause — the auditor records spoken notes while
 * walking around; each recording is stored as an audio attachment on the
 * clause's requirement response (audit_evidence, scope = response) and played
 * back inline. Distinct from the dictate-to-text mic in the Notes editor.
 *
 * Recordings go through the same audit-evidence upload path as photos/files,
 * so they'll ride the future offline pipeline (#3) with everything else. The
 * Evidence & Photos panel hides audio attachments so they only surface here.
 *
 * `ensureResponse` materialises the (possibly verdict-less) response row and
 * returns its id, so a recording can be saved before a result is picked (#27).
 */
import { IconMicrophone, IconPlayerStopFilled, IconTrash, IconLoader2 } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { upload, del } from '@/api'

const props = defineProps({
  auditInstance: { type: Object, required: true },
  // The requirement response id; may be null until the first capture.
  scopeId: { type: String, default: null },
  readonly: { type: Boolean, default: false },
  // Async () => Promise<responseId|null> — creates the response if needed.
  ensureResponse: { type: Function, default: null },
})

const toast = useToast()

// ── Existing audio attachments for this response ────────────────────────────
const uploads = useLiveQueryWithDeps(
  [() => props.auditInstance.id, () => props.scopeId],
  async (db, [instanceId, scopeId]) => {
    if (!instanceId || !scopeId) return []
    const rows = await db.AuditEvidence.where('auditInstanceId', instanceId).exec()
    return rows.filter((r) => r.auditRequirementResponseId === scopeId)
  },
  { initial: [] },
)
const assetIdList = computed(() => uploads.value.map((u) => u.assetId).filter(Boolean).join(','))
const assetsById = useLiveQueryWithDeps(
  [() => assetIdList.value],
  async (db, [csv]) => {
    if (!csv) return {}
    const wanted = new Set(csv.split(',').filter(Boolean))
    const rows = await db.Asset.where().exec()
    const map = {}
    for (const a of rows) if (wanted.has(a.id)) map[a.id] = a
    return map
  },
  { initial: {} },
)
// Only audio attachments belong to the voice-notes list.
const voiceNotes = computed(() =>
  uploads.value.filter((u) => (assetsById.value[u.assetId]?.mimeType || '').startsWith('audio/')),
)

// ── Recording (MediaRecorder) ───────────────────────────────────────────────
const recording = ref(false)
const elapsed = ref(0)
const recordedBlob = ref(null)
const recordedUrl = ref('')
const saving = ref(false)
let mediaRecorder = null
let chunks = []
let stream = null
let timer = null

// MediaRecorder output varies by browser — webm on Chrome/Firefox, mp4 on Safari.
function pickMime() {
  const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg']
  for (const c of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(c)) return c
  }
  return ''
}
function extFor(mime) {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

function clearRecorded() {
  if (recordedUrl.value) URL.revokeObjectURL(recordedUrl.value)
  recordedUrl.value = ''
  recordedBlob.value = null
}

async function startRecording() {
  if (props.readonly || recording.value) return
  clearRecorded()
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    toast.error('Microphone access was blocked. Allow it in your browser to record voice notes.')
    return
  }
  const mimeType = pickMime()
  try {
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  } catch {
    toast.error('Audio recording is not supported on this device/browser.')
    stream.getTracks().forEach((t) => t.stop())
    return
  }
  chunks = []
  mediaRecorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data)
  }
  mediaRecorder.onstop = () => {
    const type = mediaRecorder.mimeType || mimeType || 'audio/webm'
    recordedBlob.value = new Blob(chunks, { type })
    recordedUrl.value = URL.createObjectURL(recordedBlob.value)
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
  }
  mediaRecorder.start()
  recording.value = true
  elapsed.value = 0
  timer = setInterval(() => (elapsed.value += 1), 1000)
}

function stopRecording() {
  if (!recording.value) return
  mediaRecorder?.stop()
  recording.value = false
  clearInterval(timer)
  timer = null
}

function fmt(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

async function saveRecording() {
  if (!recordedBlob.value || saving.value) return
  saving.value = true
  try {
    // Materialise the response so the audio has something to attach to.
    const responseId = props.ensureResponse ? await props.ensureResponse() : props.scopeId
    if (!responseId) {
      toast.error('Could not attach the voice note — please try again.')
      return
    }
    const mime = recordedBlob.value.type || 'audio/webm'
    const filename = `voice-note-${Date.now()}.${extFor(mime)}`
    const fd = new FormData()
    fd.append('file', new File([recordedBlob.value], filename, { type: mime }))
    fd.append('auditInstanceId', props.auditInstance.id)
    fd.append('auditRequirementResponseId', responseId)
    fd.append('caption', `Voice note (${fmt(elapsed.value)})`)
    await upload('/v1/services/auditEvidence', fd)
    toast.success('Voice note saved')
    clearRecorded()
  } catch (e) {
    toast.error(e?.message || 'Failed to save voice note')
  } finally {
    saving.value = false
  }
}

async function removeNote(note) {
  if (props.readonly) return
  if (!confirm('Delete this voice note?')) return
  try {
    await del(`/v1/services/auditEvidence/${note.id}`)
    toast.success('Voice note deleted')
  } catch (e) {
    toast.error(e?.message || 'Failed to delete voice note')
  }
}

onUnmounted(() => {
  if (timer) clearInterval(timer)
  stream?.getTracks().forEach((t) => t.stop())
  if (recordedUrl.value) URL.revokeObjectURL(recordedUrl.value)
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-2">
    <!-- Existing recordings -->
    <div
      v-for="note in voiceNotes"
      :key="note.id"
      class="tw:flex tw:items-center tw:gap-2 tw:border tw:border-divider tw:rounded tw:p-2"
    >
      <audio
        v-if="assetsById[note.assetId]?.url"
        :src="assetsById[note.assetId].url"
        controls
        preload="none"
        class="tw:h-8 tw:flex-1 tw:min-w-0"
      />
      <span v-else class="tw:text-xs tw:text-secondary tw:flex-1">{{ note.caption || 'Voice note' }}</span>
      <button
        v-if="!readonly"
        type="button"
        class="tw:text-red-600 tw:hover:bg-red-50 tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0 tw:shrink-0"
        title="Delete voice note"
        @click="removeNote(note)"
      >
        <IconTrash :size="14" />
      </button>
    </div>

    <!-- Recorder -->
    <div v-if="!readonly" class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
      <BaseButton v-if="!recording && !recordedBlob" variant="outline" size="sm" @click="startRecording">
        <template #icon><IconMicrophone :size="15" /></template>
        Record voice note
      </BaseButton>

      <template v-else-if="recording">
        <span class="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:font-medium tw:text-red-600">
          <span class="tw:size-2 tw:rounded-full tw:bg-red-600 tw:animate-pulse" />
          Recording… {{ fmt(elapsed) }}
        </span>
        <BaseButton variant="danger" size="sm" @click="stopRecording">
          <template #icon><IconPlayerStopFilled :size="15" /></template>
          Stop
        </BaseButton>
      </template>

      <template v-else>
        <audio :src="recordedUrl" controls class="tw:h-8" />
        <BaseButton variant="primary" size="sm" :loading="saving" :disabled="saving" @click="saveRecording">
          <template #icon><IconLoader2 v-if="saving" :size="15" class="tw:animate-spin" /></template>
          Save
        </BaseButton>
        <BaseButton variant="outline" size="sm" :disabled="saving" @click="clearRecorded">
          Discard
        </BaseButton>
      </template>
    </div>

    <p v-else-if="!voiceNotes.length" class="tw:text-xs tw:text-secondary tw:italic">No voice notes.</p>
  </div>
</template>
