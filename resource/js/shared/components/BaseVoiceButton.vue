<script setup>
/**
 * BaseVoiceButton — browser-native voice-to-text (Web Speech API).
 *
 * Unlike the AI sidecar's Whisper button, this needs no server and no AI
 * licence — it uses the browser's built-in SpeechRecognition, so it's a free
 * fallback anywhere. Renders nothing when the browser doesn't support it
 * (Firefox), so callers can mount it unconditionally.
 *
 * Calls `append(text)` with each finalised phrase — it never overwrites.
 */
import { IconMicrophone, IconPlayerStopFilled } from '@tabler/icons-vue'

const props = defineProps({
  // append(text) — appends recognised text (does not replace existing content).
  append: { type: Function, required: true },
  size: { type: Number, default: 18 },
})

const toast = useToast()

const SpeechRecognition =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null
const supported = !!SpeechRecognition

const listening = ref(false)
let recognition = null

function stop() {
  if (recognition) {
    try {
      recognition.stop()
    } catch {
      /* already stopped */
    }
  }
}

function start() {
  recognition = new SpeechRecognition()
  recognition.lang = navigator.language || 'en-US'
  recognition.continuous = true
  recognition.interimResults = false

  recognition.onresult = (event) => {
    let text = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (result.isFinal) text += result[0].transcript
    }
    text = text.trim()
    if (text) props.append(text)
  }
  recognition.onerror = (event) => {
    listening.value = false
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      toast.error('Microphone access was denied.')
    } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
      toast.error('Voice input failed. Please try again.')
    }
  }
  recognition.onend = () => {
    listening.value = false
    recognition = null
  }

  try {
    recognition.start()
    listening.value = true
  } catch {
    listening.value = false
  }
}

function toggle() {
  if (listening.value) stop()
  else start()
}

onBeforeUnmount(stop)
</script>

<template>
  <button
    v-if="supported"
    type="button"
    :title="listening ? 'Stop dictation' : 'Dictate (browser voice-to-text)'"
    :aria-pressed="listening"
    class="tw:min-w-8 tw:min-h-8 tw:rounded tw:flex tw:items-center tw:justify-center tw:border-0 tw:cursor-pointer tw:p-1"
    :class="
      listening
        ? 'tw:bg-red-100 tw:text-red-600 tw:animate-pulse'
        : 'tw:text-secondary tw:bg-transparent tw:hover:bg-main-hover tw:hover:text-on-main'
    "
    @click.stop="toggle"
  >
    <IconPlayerStopFilled v-if="listening" :size="size" />
    <IconMicrophone v-else :size="size" />
  </button>
</template>
