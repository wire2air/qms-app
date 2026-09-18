<script setup>
import {
  IconSparkles,
  IconAlertTriangle,
  IconLoader2,
  IconPlus,
  IconMinus,
  IconPencil,
} from '@tabler/icons-vue'

/**
 * AI summary of changes between two document versions (Phase 4).
 *
 * Auto-fires when opened with both versionIds set.
 */

const props = defineProps({
  fromVersionId: { type: String, default: null },
  toVersionId: { type: String, default: null },
  fromLabel: { type: String, default: '' }, // e.g. "1.0"
  toLabel: { type: String, default: '' },
})

const show = defineModel({ type: Boolean, default: false })

const ENDPOINT = '/api/v1/services/ai/tasks/document.diff_summary/run'

const loading = ref(false)
const error = ref(null)
const result = ref(null)
const usage = ref(null)

const significanceClass = computed(() => {
  if (!result.value) return ''
  switch (result.value.significance) {
    case 'MAJOR':
      return 'tw:bg-red-100 tw:text-red-800 tw:border-red-200'
    case 'MODERATE':
      return 'tw:bg-amber-100 tw:text-amber-800 tw:border-amber-200'
    case 'MINOR':
    default:
      return 'tw:bg-green-100 tw:text-green-800 tw:border-green-200'
  }
})

async function generate() {
  if (!props.fromVersionId || !props.toVersionId) return
  if (loading.value) return
  loading.value = true
  error.value = null
  result.value = null
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        fromVersionId: props.fromVersionId,
        toVersionId: props.toVersionId,
      }),
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
          <span class="tw:text-2xl tw:font-bold tw:text-on-main">What Changed</span>
          <span v-if="fromLabel || toLabel" class="tw:text-sm tw:text-secondary tw:truncate">
            v{{ fromLabel || '?' }} → v{{ toLabel || '?' }}
          </span>
        </div>
      </div>
    </template>

    <template v-if="loading">
      <div class="tw:flex tw:flex-col tw:items-center tw:gap-3 tw:py-10">
        <IconLoader2 :size="40" class="tw:text-primary tw:animate-spin" />
        <div class="tw:text-sm tw:text-secondary">Comparing versions…</div>
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
        <!-- Top summary + significance -->
        <div class="tw:flex tw:items-start tw:gap-3">
          <span
            class="tw:flex-none tw:px-2 tw:py-0.5 tw:rounded tw:border tw:text-xs tw:font-semibold tw:uppercase tw:mt-0.5"
            :class="significanceClass"
          >
            {{ result.significance }}
          </span>
          <div class="tw:text-sm tw:text-on-main tw:leading-relaxed">{{ result.summary }}</div>
        </div>

        <!-- Changed sections -->
        <div v-if="result.changedSections?.length">
          <BaseText variant="overline" class="tw:flex tw:items-center tw:gap-2 tw:mb-2">
            <IconPencil :size="14" />
            Changed ({{ result.changedSections.length }})
          </BaseText>
          <div class="tw:flex tw:flex-col tw:gap-2">
            <div
              v-for="(s, i) in result.changedSections"
              :key="`c${i}`"
              class="tw:border tw:border-divider tw:rounded-lg tw:p-3 tw:bg-sidebar"
            >
              <div class="tw:text-sm tw:font-semibold tw:text-on-main">{{ s.title }}</div>
              <div class="tw:text-sm tw:text-on-main tw:mt-1">{{ s.what }}</div>
              <div v-if="s.why" class="tw:text-xs tw:text-secondary tw:mt-1 tw:italic">
                Why: {{ s.why }}
              </div>
            </div>
          </div>
        </div>

        <!-- Added sections -->
        <div v-if="result.addedSections?.length">
          <div
            class="tw:flex tw:items-center tw:gap-2 tw:text-caption tw:text-green-700 tw:font-semibold tw:uppercase tw:tracking-wider tw:mb-2"
          >
            <IconPlus :size="14" />
            Added ({{ result.addedSections.length }})
          </div>
          <div class="tw:flex tw:flex-col tw:gap-2">
            <div
              v-for="(s, i) in result.addedSections"
              :key="`a${i}`"
              class="tw:border tw:border-green-200 tw:bg-green-50 tw:rounded-lg tw:p-3"
            >
              <div class="tw:text-sm tw:font-semibold tw:text-green-900">{{ s.title }}</div>
              <div v-if="s.why" class="tw:text-xs tw:text-green-800 tw:mt-1">{{ s.why }}</div>
            </div>
          </div>
        </div>

        <!-- Removed sections -->
        <div v-if="result.removedSections?.length">
          <div
            class="tw:flex tw:items-center tw:gap-2 tw:text-caption tw:text-red-700 tw:font-semibold tw:uppercase tw:tracking-wider tw:mb-2"
          >
            <IconMinus :size="14" />
            Removed ({{ result.removedSections.length }})
          </div>
          <div class="tw:flex tw:flex-col tw:gap-2">
            <div
              v-for="(s, i) in result.removedSections"
              :key="`r${i}`"
              class="tw:border tw:border-red-200 tw:bg-red-50 tw:rounded-lg tw:p-3"
            >
              <div class="tw:text-sm tw:font-semibold tw:text-red-900">{{ s.title }}</div>
              <div v-if="s.impact" class="tw:text-xs tw:text-red-800 tw:mt-1">{{ s.impact }}</div>
            </div>
          </div>
        </div>

        <div
          v-if="
            !result.changedSections?.length &&
            !result.addedSections?.length &&
            !result.removedSections?.length
          "
          class="tw:text-sm tw:text-secondary tw:italic tw:text-center tw:py-4"
        >
          No substantive section-level differences found.
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
