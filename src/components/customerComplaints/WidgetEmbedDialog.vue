<script setup>
import { IconCheck, IconCopy, IconMessageCircle } from '@tabler/icons-vue'
import { currentSession } from '@/utils/currentSession.js'

const modelValue = defineModel({ type: Boolean, default: false })

const toast = useToast()

const apiUrl = import.meta.env.VITE_PUBLIC_API_URL || window.location.origin
const syncUrl = import.meta.env.VITE_PUBLIC_SYNC_URL || window.location.origin

const companyCode = computed(() => (currentSession.value?.code || '').toLowerCase())

const snippet = computed(() => {
  if (!companyCode.value) return ''
  return `<script\n  src="${apiUrl}/widget/widget.iife.js"\n  data-company="${companyCode.value}"\n  data-api="${apiUrl}"\n  data-sync="${syncUrl}"\n><` + `/script>`
})

const { copy, copied, isSupported } = useClipboard({ copiedDuring: 1500 })

async function handleCopy() {
  if (!snippet.value) return
  if (!isSupported.value) {
    toast.notify({ type: 'negative', message: 'Clipboard not available — copy manually.' })
    return
  }
  await copy(snippet.value)
  toast.notify({ type: 'positive', message: 'Snippet copied' })
}

const activeTab = ref('snippet')
</script>

<template>
  <BaseDialog v-model="modelValue" title="Embed chat widget" maxWidth="lg">
    <div class="tw:flex tw:flex-col tw:gap-5">
      <!-- Preview of what the widget looks like -->
      <div class="tw:flex tw:items-start tw:gap-4 tw:bg-blue-50 tw:border tw:border-blue-100 tw:rounded-lg tw:p-4">
        <div class="tw:w-10 tw:h-10 tw:rounded-full tw:bg-blue-600 tw:flex tw:items-center tw:justify-center tw:shrink-0">
          <IconMessageCircle :size="20" class="tw:text-white" />
        </div>
        <div class="tw:flex tw:flex-col tw:gap-0.5">
          <div class="tw:text-sm tw:font-semibold tw:text-blue-900">Floating chat button</div>
          <div class="tw:text-xs tw:text-blue-700 tw:leading-relaxed">
            Paste the snippet below into any webpage. A chat button appears in the bottom-right
            corner. Customers fill in their name and email, then start a real-time conversation
            that creates a ticket in your queue.
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tw:flex tw:gap-1 tw:border-b tw:border-divider">
        <button
          class="tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:border-b-2 tw:transition-colors tw:bg-transparent tw:cursor-pointer"
          :class="activeTab === 'snippet'
            ? 'tw:border-primary tw:text-primary'
            : 'tw:border-transparent tw:text-secondary tw:hover:text-on-main'"
          @click="activeTab = 'snippet'"
        >
          Embed code
        </button>
        <button
          class="tw:px-4 tw:py-2 tw:text-sm tw:font-medium tw:border-b-2 tw:transition-colors tw:bg-transparent tw:cursor-pointer"
          :class="activeTab === 'config'
            ? 'tw:border-primary tw:text-primary'
            : 'tw:border-transparent tw:text-secondary tw:hover:text-on-main'"
          @click="activeTab = 'config'"
        >
          Configuration
        </button>
      </div>

      <!-- Embed code tab -->
      <div v-if="activeTab === 'snippet'" class="tw:flex tw:flex-col tw:gap-3">
        <p class="tw:text-sm tw:text-secondary">
          Copy this snippet and paste it before the closing
          <code class="tw:font-mono tw:bg-main-hover tw:rounded tw:px-1 tw:text-xs">&lt;/body&gt;</code>
          tag on every page where you want the widget to appear.
        </p>

        <div class="tw:relative">
          <pre class="tw:bg-gray-950 tw:text-green-400 tw:rounded-lg tw:p-4 tw:text-xs tw:font-mono tw:leading-relaxed tw:overflow-x-auto tw:whitespace-pre-wrap tw:break-all">{{ snippet }}</pre>
          <button
            class="tw:absolute tw:top-2 tw:right-2 tw:flex tw:items-center tw:gap-1.5 tw:px-2.5 tw:py-1.5 tw:rounded tw:text-xs tw:font-medium tw:transition-colors tw:cursor-pointer tw:border-0"
            :class="copied
              ? 'tw:bg-green-600 tw:text-white'
              : 'tw:bg-gray-700 tw:text-gray-300 tw:hover:bg-gray-600'"
            @click="handleCopy"
          >
            <IconCheck v-if="copied" :size="12" />
            <IconCopy v-else :size="12" />
            {{ copied ? 'Copied!' : 'Copy' }}
          </button>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2 tw:bg-amber-50 tw:border tw:border-amber-100 tw:rounded-lg tw:p-3 tw:text-xs tw:text-amber-800">
          <div class="tw:font-semibold">Before going live</div>
          <ul class="tw:list-disc tw:pl-4 tw:flex tw:flex-col tw:gap-1">
            <li>
              Replace <code class="tw:font-mono tw:bg-amber-100 tw:rounded tw:px-0.5">data-api</code>
              and <code class="tw:font-mono tw:bg-amber-100 tw:rounded tw:px-0.5">data-sync</code>
              with your production service URLs if they differ from the values shown.
            </li>
            <li>Make sure your API allows CORS from the domain embedding the widget.</li>
            <li>The widget stores a visitor session token in <code class="tw:font-mono tw:bg-amber-100 tw:rounded tw:px-0.5">localStorage</code> so returning visitors resume their conversation.</li>
          </ul>
        </div>
      </div>

      <!-- Configuration tab -->
      <div v-if="activeTab === 'config'" class="tw:flex tw:flex-col tw:gap-4">
        <p class="tw:text-sm tw:text-secondary">
          All configuration is done via <code class="tw:font-mono tw:bg-main-hover tw:rounded tw:px-1 tw:text-xs">data-*</code> attributes on the script tag.
        </p>

        <div class="tw:flex tw:flex-col tw:gap-2">
          <div
            v-for="attr in [
              { name: 'data-company', value: companyCode, desc: 'Your company\'s short code. Used to route incoming chats to the right ticket queue.' },
              { name: 'data-api', value: apiUrl, desc: 'Base URL of the Qability API service. Handles session creation and message persistence.' },
              { name: 'data-sync', value: syncUrl, desc: 'Base URL of the Qability sync service. Provides the real-time Socket.io connection for live chat.' },
            ]"
            :key="attr.name"
            class="tw:bg-main-hover tw:rounded-lg tw:p-3 tw:flex tw:flex-col tw:gap-1"
          >
            <div class="tw:flex tw:items-center tw:gap-2">
              <code class="tw:font-mono tw:text-xs tw:font-semibold tw:text-primary">{{ attr.name }}</code>
              <span class="tw:text-xs tw:font-mono tw:text-secondary tw:bg-white tw:border tw:border-divider tw:rounded tw:px-1.5 tw:py-0.5">{{ attr.value }}</span>
            </div>
            <p class="tw:text-xs tw:text-secondary">{{ attr.desc }}</p>
          </div>
        </div>

        <div class="tw:flex tw:flex-col tw:gap-2">
          <div class="tw:text-xs tw:font-semibold tw:text-secondary tw:uppercase tw:tracking-wider">How it works</div>
          <ol class="tw:text-xs tw:text-secondary tw:list-decimal tw:pl-4 tw:flex tw:flex-col tw:gap-1.5 tw:leading-relaxed">
            <li>Visitor opens the chat, enters name and email, types a first message.</li>
            <li>A <strong class="tw:text-on-main">CC-NNNNNN</strong> ticket is created in your queue with source <strong class="tw:text-on-main">Live Chat</strong>.</li>
            <li>Your agent replies from the ticket detail page — the reply appears live in the visitor's chat window.</li>
            <li>If the visitor closes the tab and returns, the widget resumes the same conversation (via <code class="tw:font-mono">localStorage</code> token).</li>
            <li>Knowledge base articles you've published appear in the widget before the visitor starts chatting.</li>
          </ol>
        </div>
      </div>
    </div>

    <template #footer>
      <BaseButton variant="outline" @click="modelValue = false">Close</BaseButton>
      <BaseButton variant="primary" :disabled="!snippet" @click="handleCopy">
        <template #icon>
          <IconCheck v-if="copied" :size="14" />
          <IconCopy v-else :size="14" />
        </template>
        {{ copied ? 'Copied!' : 'Copy snippet' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
