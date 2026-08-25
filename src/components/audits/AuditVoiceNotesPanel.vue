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
import {
  IconMicrophone,
  IconPlayerStopFilled,
  IconTrash,
  IconFileText,
} from '@tabler/icons-vue'
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

// transcribed(block): marker-wrapped transcript for the parent to APPEND to
// Auditor Notes — the panel never touches the notes itself.
const emit = defineEmits(['transcribed'])

const toast = useToast()
const { confirm } = useConfirm()

// ── Existing audio attachments for this response ────────────────────────────
const uploads = useLiveQueryWithDeps(
  [() => props.auditInstance.id, () => props.scopeId],
  async (db, [instanceId, scopeId]) => {
    if (!instanceId || !scopeId) return []
    const rows = await db.AuditEvidence.where('auditInstanceId', instanceId).exec()
    return rows.filter((r) => r.auditRequirementResponseId === scopeId)
  },

  { models: ['AuditEvidence'], initial: [] },
)
const assetIdList = computed(() =>
  uploads.value
    .map((u) => u.assetId)
    .filter(Boolean)
    .join(','),
)
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

  { models: ['Asset'], initial: {} },
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
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    // Save by default (user call 2026-08-24): stopping IS saving — no
    // Save/Discard step between the auditor and their next clause. A bad
    // take is deleted from the list afterwards.
    saveRecording()
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
    chunks = []
  } catch (e) {
    toast.error(e?.message || 'Failed to save voice note')
  } finally {
    saving.value = false
  }
}

// ── Convert to text: transcribe the saved audio and hand the parent a
// marker-wrapped block to APPEND to Auditor Notes (never replace).
const transcribingId = ref(null)

async function transcribeNote(note) {
  const asset = assetsById.value[note.assetId]
  if (!asset?.url || transcribingId.value) return
  transcribingId.value = note.id
  try {
    const res = await fetch(asset.url, { credentials: 'include' })
    if (!res.ok) throw new Error('Could not load the recording.')
    const blob = await res.blob()
    const fd = new FormData()
    fd.append('file', blob, 'voice-note.webm')
    const out = await upload('/v1/services/ai/transcribe', fd)
    const text = out?.text?.trim()
    if (!text) {
      toast.warning('No speech detected in this voice note.')
      return
    }
    const takenAt = note.createdAt?.formatDate
      ? note.createdAt.formatDate('datetime')
      : String(note.createdAt ?? '')
    emit(
      'transcribed',
      `<p>++++ From Voice Note (taken ${takenAt}) ++++</p><p>${text
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join('</p><p>')}</p><p>++++</p>`,
    )
    toast.success('Transcript appended to Auditor Notes.')
  } catch (e) {
    toast.error(e?.message || 'Transcription failed')
  } finally {
    transcribingId.value = null
  }
}

async function removeNote(note) {
  if (props.readonly) return
  if (
    !(await confirm({
      title: 'Delete voice note',
      message: 'Delete this voice note?',
      okLabel: 'Delete',
      danger: true,
    }))
  )
    return
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
      <div class="tw:flex-1 tw:min-w-0 tw:flex tw:flex-col tw:gap-0.5">
        <audio
          v-if="assetsById[note.assetId]?.url"
          :src="assetsById[note.assetId].url"
          controls
          preload="none"
          class="tw:h-8 tw:w-full tw:min-w-0"
        />
        <span v-else class="tw:text-xs tw:text-secondary">{{
          note.caption || 'Voice note'
        }}</span>
        <span class="tw:text-micro tw:text-secondary">
          Taken {{ note.createdAt?.formatDate ? note.createdAt.formatDate('datetime') : '—' }}
        </span>
      </div>
      <BaseTooltip v-if="!readonly" content="Convert to text — appends to Auditor Notes">
        <button
          type="button"
          class="tw:text-primary tw:hover:bg-primary/10 tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0 tw:shrink-0 tw:flex tw:items-center"
          :disabled="transcribingId === note.id"
          aria-label="Convert voice note to text"
          @click="transcribeNote(note)"
        >
          <BaseSpinner v-if="transcribingId === note.id" size="xs" />
          <IconFileText v-else :size="14" />
        </button>
      </BaseTooltip>
      <BaseTooltip v-if="!readonly" content="Delete voice note">
        <button
          type="button"
          class="tw:text-red-600 tw:hover:bg-red-50 tw:rounded tw:p-1 tw:cursor-pointer tw:bg-transparent tw:border-0 tw:shrink-0 tw:flex tw:items-center"
          aria-label="Delete voice note"
          @click="removeNote(note)"
        >
          <IconTrash :size="14" />
        </button>
      </BaseTooltip>
    </div>

    <!-- Recorder -->
    <div v-if="!readonly" class="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
      <BaseButton
        v-if="!recording && !saving"
        variant="outline"
        size="sm"
        @click="startRecording"
      >
        <template #icon><IconMicrophone :size="15" /></template>
        Record voice note
      </BaseButton>

      <template v-else-if="recording">
        <span
          class="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:font-medium tw:text-red-600"
        >
          <span class="tw:size-2 tw:rounded-full tw:bg-red-600 tw:animate-pulse" />
          Recording… {{ fmt(elapsed) }}
        </span>
        <BaseButton variant="danger" size="sm" @click="stopRecording">
          <template #icon><IconPlayerStopFilled :size="15" /></template>
          Stop &amp; save
        </BaseButton>
      </template>

      <span
        v-else-if="saving"
        class="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-secondary"
      >
        <BaseSpinner size="xs" /> Saving voice note…
      </span>
    </div>

    <p v-else-if="!voiceNotes.length" class="tw:text-xs tw:text-secondary tw:italic">
      No voice notes.
    </p>
  </div>
</template>
