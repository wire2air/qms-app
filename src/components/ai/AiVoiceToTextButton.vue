<script setup>
/**
 * AI sidecar — voice-to-text mic button. Drops into BaseRichTextEditor's
 * #toolbar-extra slot (AI-free editor). Records audio, posts it to the AI
 * transcribe endpoint (OpenAI Whisper), and APPENDS the transcript to the
 * editor (never overwrites) via the slot's `append`.
 *
 * Gate with `canUseAi` at the call site so non-AI tenants never see it.
 */
import { IconMicrophone, IconPlayerStopFilled, IconLoader2 } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { upload } from '@/api'

const props = defineProps({
  // appendText(text) from the editor slot — appends at the end.
  append: { type: Function, required: true },
})

const toast = useToast()
const state = ref('idle') // 'idle' | 'recording' | 'transcribing'
let mediaRecorder = null
let chunks = []
let stream = null

async function start() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast.error('Recording is not supported in this browser.')
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    toast.error('Microphone access was denied.')
    return
  }
  chunks = []
  mediaRecorder = new MediaRecorder(stream)
  mediaRecorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data)
  }
  mediaRecorder.onstop = onStop
  mediaRecorder.start()
  state.value = 'recording'
}

function stop() {
  if (mediaRecorder && state.value === 'recording') mediaRecorder.stop()
}

async function onStop() {
  stream?.getTracks().forEach((t) => t.stop())
  state.value = 'transcribing'
  try {
    const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'audio/webm' })
    if (!blob.size) {
      toast.info('Nothing was recorded.')
      return
    }
    const fd = new FormData()
    fd.append('file', blob, 'recording.webm')
    const res = await upload('/v1/services/ai/transcribe', fd)
    const text = res?.text?.trim()
    if (text) props.append(text)
    else toast.info('No speech detected.')
  } catch (e) {
    toast.error(e?.message || 'Transcription failed.')
  } finally {
    state.value = 'idle'
  }
}

function toggle() {
  if (state.value === 'idle') start()
  else if (state.value === 'recording') stop()
}

onBeforeUnmount(() => stream?.getTracks().forEach((t) => t.stop()))
</script>

<template>
  <button
    type="button"
    :title="state === 'recording' ? 'Stop & transcribe' : 'Dictate (voice to text)'"
    :disabled="state === 'transcribing'"
    class="tw:min-w-8 tw:min-h-8 tw:rounded tw:flex tw:items-center tw:justify-center tw:border-0 tw:cursor-pointer tw:p-1"
    :class="
      state === 'recording'
        ? 'tw:bg-red-100 tw:text-red-600 tw:animate-pulse'
        : 'tw:text-secondary tw:bg-transparent tw:hover:bg-main-hover tw:hover:text-on-main'
    "
    @click="toggle"
  >
    <IconLoader2 v-if="state === 'transcribing'" :size="18" class="tw:animate-spin" />
    <IconPlayerStopFilled v-else-if="state === 'recording'" :size="18" />
    <IconMicrophone v-else :size="18" />
  </button>
</template>
