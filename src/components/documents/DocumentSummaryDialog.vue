<script setup>
import {
  IconSparkles,
  IconAlertTriangle,
  IconLoader2,
  IconClock,
  IconUsers,
  IconShieldCheck,
} from '@tabler/icons-vue'

/**
 * AI summary of a single document version (Phase 4).
 *
 * Auto-fires the request when the dialog opens — no user input needed; the
 * versionId is passed via prop. Read-only result; user reviews and closes.
 */

const props = defineProps({
  versionId: { type: String, default: null },
  documentTitle: { type: String, default: '' },
})

const show = defineModel({ type: Boolean, default: false })

const ENDPOINT = '/api/v1/services/ai/tasks/document.summarize_version/run'

const loading = ref(false)
const error = ref(null)
const result = ref(null)
const usage = ref(null)

async function generate() {
  if (!props.versionId) return
  if (loading.value) return
  loading.value = true
  error.value = null
  result.value = null
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ versionId: props.versionId }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      error.value = {
        code: json?.error?.code ?? `HTTP_${res.status}`,
        message: json?.error?.message ?? `Request failed (${res.status}).`,
      }
      return
    }
    result.value = json.result
    usage.value = json.usage
  } catch (e) {
    error.value = { code: 'NETWORK', message: e.message ?? 'Network error.' }
  } finally {
    loading.value = false
  }
}

watch(show, (open) => {
  if (open && !result.value && !loading.value) {
    generate()
  }
  if (!open) {
    setTimeout(() => {
      result.value = null
      error.value = null
      usage.value = null
    }, 200)
  }
})
</script>

<template>
  <BaseDialog v-model="show" maxWidth="2xl">
    <template #title>
      <div class="tw:flex tw:items-center tw:gap-3">
        <div
          class="tw:w-10 tw:h-10 tw:bg-primary/10 tw:text-primary tw:rounded-xl tw:flex tw:items-center tw:justify-center"
        >
          <IconSparkles :size="24" />
        </div>
        <div class="tw:flex tw:flex-col tw:min-w-0">
          <span class="tw:text-2xl tw:font-bold tw:text-on-main">AI Summary</span>
          <span v-if="documentTitle" class="tw:text-sm tw:text-secondary tw:truncate">{{ documentTitle }}</span>
        </div>
      </div>
    </template>

    <template v-if="loading">
      <div class="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:py-10">
        <IconLoader2 :size="40" class="tw:text-primary tw:animate-spin" />
        <div class="tw:text-sm tw:text-secondary">Reading the document…</div>
      </div>
    </template>

    <template v-else-if="error">
      <div
        class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-red-50 tw:border tw:border-red-200 tw:text-red-800 tw:text-sm"
      >
        <IconAlertTriangle :size="16" class="tw:mt-0.5 tw:flex-none" />
        <div class="tw:flex-1 tw:min-w-0">
          <div class="tw:font-semibold">{{ error.code || 'Error' }}</div>
          <div class="tw:text-xs tw:mt-0.5 tw:break-words">{{ error.message }}</div>
        </div>
      </div>
    </template>

    <template v-else-if="result">
      <div class="tw:flex tw:flex-col tw:gap-4">
        <!-- TL;DR -->
        <div>
          <div class="tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:tracking-wide tw:mb-1">
            TL;DR
          </div>
          <div class="tw:text-sm tw:text-on-main tw:leading-relaxed">{{ result.tldr }}</div>
        </div>

        <!-- Key points -->
        <div>
          <div class="tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase tw:tracking-wide tw:mb-2">
            Key points
          </div>
          <ul class="tw:list-disc tw:pl-5 tw:flex tw:flex-col tw:gap-1 tw:text-sm tw:text-on-main">
            <li v-for="(point, i) in result.keyPoints" :key="i">{{ point }}</li>
          </ul>
        </div>

        <!-- Meta -->
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-3 tw:gap-3">
          <div class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-sidebar tw:border tw:border-divider">
            <IconUsers :size="16" class="tw:text-primary tw:mt-0.5 tw:flex-none" />
            <div class="tw:min-w-0">
              <div class="tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase">Audience</div>
              <div class="tw:text-sm tw:text-on-main">{{ result.audience }}</div>
            </div>
          </div>
          <div class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-sidebar tw:border tw:border-divider">
            <IconClock :size="16" class="tw:text-primary tw:mt-0.5 tw:flex-none" />
            <div class="tw:min-w-0">
              <div class="tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase">Read time</div>
              <div class="tw:text-sm tw:text-on-main">{{ result.estimatedReadMinutes }} min</div>
            </div>
          </div>
          <div
            v-if="result.complianceNotes"
            class="tw:flex tw:items-start tw:gap-2 tw:p-3 tw:rounded-lg tw:bg-sidebar tw:border tw:border-divider tw:sm:col-span-3 tw:lg:col-span-1"
          >
            <IconShieldCheck :size="16" class="tw:text-primary tw:mt-0.5 tw:flex-none" />
            <div class="tw:min-w-0">
              <div class="tw:text-xs tw:text-secondary tw:font-semibold tw:uppercase">Compliance</div>
              <div class="tw:text-sm tw:text-on-main">{{ result.complianceNotes }}</div>
            </div>
          </div>
        </div>

        <div v-if="usage" class="tw:text-xs tw:text-secondary tw:text-right">
          {{ usage.inputTokens }} in / {{ usage.outputTokens }} out
        </div>
      </div>
    </template>

    <template #footer>
      <BaseButton variant="outline" @click="show = false">Close</BaseButton>
    </template>
  </BaseDialog>
</template>
