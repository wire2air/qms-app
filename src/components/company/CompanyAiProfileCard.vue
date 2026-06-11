<script setup>
/**
 * AI profile admin card. Loaded into the Settings page when the user
 * has the `ai:manage` permission (owners always do). Talks to the new
 * /v1/services/ai/profile endpoints — GET on mount + PATCH on save.
 *
 * Two failure modes the FE handles explicitly:
 *   - 404 on GET → the BE route file (ai*) wasn't loaded because the
 *     server's AI_MODULE_ENABLED env flag is false. We surface the
 *     exact config knob the operator needs to flip.
 *   - 403 on PATCH → the user lost `ai:manage` permission between
 *     mount and save. Toast surfaces the BE's own error message.
 *
 * BYOK key entry is intentionally NOT in this card. encryptedApiKeys
 * needs the sealed-secret crypto path and is a separate change; this
 * card configures *behaviour* (toggle + provider + caps + retention),
 * and the actual key currently lives in the server-side ANTHROPIC_API_KEY
 * env var until BYOK lands.
 */
import { IconSparkles, IconAlertTriangle } from '@tabler/icons-vue'
import { isAllowed } from '@/utils/currentSession.js'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, patch } from '@/api'

const toast = useToast()

const canManage = computed(() => isAllowed(['ai:manage']))

// Provider / model catalogue. Keep the lists short — we deliberately
// only surface what the current AI sidecar adapter knows how to talk to
// (backend/ai/core/providerAdapter.js). Adding a new entry here without
// the BE provider plumbing would just produce a 503 at runtime.
const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic (Claude)' },
  { id: 'openai', label: 'OpenAI (GPT)' },
]

const MODELS_BY_PROVIDER = {
  anthropic: [
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 (highest quality)' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (balanced)' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast / cheap)' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  ],
}

const REDACTION_MODES = [
  { id: 'standard', label: 'Standard — names/emails redacted from logs' },
  { id: 'strict', label: 'Strict — all PII candidates redacted' },
  { id: 'none', label: 'None — payloads logged verbatim (dev only)' },
]

const profile = ref(null)
const loadError = ref(null)
const loading = ref(true)
const saving = ref(false)
const moduleOffMessage = ref(null)

const availableModels = computed(() =>
  profile.value?.provider ? MODELS_BY_PROVIDER[profile.value.provider] ?? [] : [],
)

async function load() {
  loading.value = true
  loadError.value = null
  moduleOffMessage.value = null
  try {
    const res = await get('/v1/services/ai/profile')
    profile.value = res?.aiProfile ?? null
  } catch (err) {
    // Route file is `ai*` so it's skipped when AI_MODULE_ENABLED is not
    // "true". A 404 here means the server hasn't loaded the AI routes —
    // surface the actual env knob the operator needs to flip rather
    // than a generic error.
    if (err?.status === 404 || /not found/i.test(err?.message ?? '')) {
      moduleOffMessage.value =
        'AI module is disabled at the server level. Set AI_MODULE_ENABLED=true in the server\'s .env, configure an ANTHROPIC_API_KEY (or equivalent), and restart api / worker. Then this tab will become available.'
    } else {
      loadError.value = err?.message || 'Failed to load AI profile'
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function save() {
  if (!profile.value || saving.value) return
  saving.value = true
  try {
    const body = {
      enabled: profile.value.enabled,
      provider: profile.value.provider ?? null,
      model: profile.value.model ?? null,
      dailyTokenCap:
        profile.value.dailyTokenCap === '' || profile.value.dailyTokenCap == null
          ? null
          : Number(profile.value.dailyTokenCap),
      redactionMode: profile.value.redactionMode,
      regulatedMode: !!profile.value.regulatedMode,
      messageRetentionDays: Number(profile.value.messageRetentionDays ?? 90),
      payloadRetentionDays: Number(profile.value.payloadRetentionDays ?? 90),
    }
    const res = await patch('/v1/services/ai/profile', body)
    profile.value = res?.aiProfile ?? profile.value
    toast.success('AI profile saved. The next page refresh will pick it up.')
  } catch (err) {
    toast.error(err?.message || 'Failed to save AI profile')
  } finally {
    saving.value = false
  }
}

// Auto-clear model when provider flips — otherwise a stale anthropic
// model id would still be in the field after switching to openai.
watch(
  () => profile.value?.provider,
  (provider, prevProvider) => {
    if (!profile.value) return
    if (provider === prevProvider) return
    const valid = MODELS_BY_PROVIDER[provider] ?? []
    if (!valid.some((m) => m.id === profile.value.model)) {
      profile.value.model = valid[0]?.id ?? null
    }
  },
)
</script>

<template>
  <div class="tw:bg-white tw:border tw:border-divider tw:rounded-lg tw:p-6 tw:flex tw:flex-col tw:gap-5">
    <div class="tw:flex tw:items-center tw:gap-2">
      <IconSparkles :size="20" class="tw:text-primary" />
      <h3 class="tw:text-lg tw:font-bold tw:text-on-main">AI Configuration</h3>
    </div>

    <div v-if="loading" class="tw:text-sm tw:text-secondary">Loading…</div>

    <!-- Server-level disabled. -->
    <div
      v-else-if="moduleOffMessage"
      class="tw:rounded-lg tw:border tw:border-amber-300 tw:bg-amber-50 tw:p-4 tw:text-sm tw:text-amber-900 tw:flex tw:items-start tw:gap-3"
    >
      <IconAlertTriangle :size="20" class="tw:shrink-0 tw:mt-0.5" />
      <div class="tw:leading-relaxed">
        <div class="tw:font-semibold tw:mb-1">AI module not loaded.</div>
        <div>{{ moduleOffMessage }}</div>
      </div>
    </div>

    <!-- Hard error. -->
    <div
      v-else-if="loadError"
      class="tw:rounded-lg tw:border tw:border-red-300 tw:bg-red-50 tw:p-3 tw:text-xs tw:text-red-800 tw:flex tw:items-start tw:gap-2"
    >
      <IconAlertTriangle :size="16" class="tw:shrink-0 tw:mt-0.5" />
      <span>{{ loadError }}</span>
    </div>

    <!-- Profile form. -->
    <template v-else-if="profile">
      <div
        v-if="!canManage"
        class="tw:rounded tw:bg-gray-50 tw:border tw:border-gray-200 tw:p-2 tw:text-[11px] tw:text-gray-700"
      >
        Read-only — you need the <code>ai:manage</code> permission to change these settings.
      </div>

      <!-- Master toggle -->
      <label class="tw:flex tw:items-start tw:gap-3 tw:p-3 tw:rounded-lg tw:border tw:border-divider tw:cursor-pointer tw:hover:bg-main-hover/40">
        <input
          v-model="profile.enabled"
          type="checkbox"
          :disabled="!canManage"
          class="tw:mt-0.5"
        />
        <div class="tw:flex tw:flex-col">
          <span class="tw:text-sm tw:font-semibold">AI features enabled for this company</span>
          <span class="tw:text-xs tw:text-secondary">
            Toggles AI Generate / AI Assist Import / Chat panel / AI sidecar tools across the app for every user. Flipping this off hides all AI affordances on next page refresh.
          </span>
        </div>
      </label>

      <!-- Provider + model -->
      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-4">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Provider</p>
          <select
            v-model="profile.provider"
            :disabled="!canManage"
            class="tw:w-full tw:border tw:border-divider tw:rounded tw:px-2 tw:py-1.5 tw:text-sm"
          >
            <option :value="null">— None —</option>
            <option v-for="p in PROVIDERS" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">Model</p>
          <select
            v-model="profile.model"
            :disabled="!canManage || !profile.provider"
            class="tw:w-full tw:border tw:border-divider tw:rounded tw:px-2 tw:py-1.5 tw:text-sm"
          >
            <option :value="null">— Pick a provider first —</option>
            <option v-for="m in availableModels" :key="m.id" :value="m.id">{{ m.label }}</option>
          </select>
        </div>
      </div>

      <!-- Token cap + regulated mode -->
      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-4">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Daily token cap
          </p>
          <BaseTextInput
            v-model="profile.dailyTokenCap"
            type="number"
            min="0"
            placeholder="No cap"
            :disabled="!canManage"
          />
          <p class="tw:text-[11px] tw:text-secondary tw:mt-1">
            Soft cap on combined input + output tokens per day across the tenant. Leave blank for no cap.
          </p>
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Regulated mode
          </p>
          <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:cursor-pointer">
            <input
              v-model="profile.regulatedMode"
              type="checkbox"
              :disabled="!canManage"
            />
            <span>Disable model fallbacks; require explicit human approval for any AI-assisted controlled-record change.</span>
          </label>
        </div>
      </div>

      <!-- Redaction -->
      <div>
        <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
          Payload redaction
        </p>
        <select
          v-model="profile.redactionMode"
          :disabled="!canManage"
          class="tw:w-full tw:border tw:border-divider tw:rounded tw:px-2 tw:py-1.5 tw:text-sm"
        >
          <option v-for="m in REDACTION_MODES" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
        <p class="tw:text-[11px] tw:text-secondary tw:mt-1">
          Controls how aggressively user-supplied content is redacted before being logged into ai_job_payloads.
        </p>
      </div>

      <!-- Retention -->
      <div class="tw:grid tw:grid-cols-1 tw:md:grid-cols-2 tw:gap-4">
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Message retention (days)
          </p>
          <BaseTextInput
            v-model="profile.messageRetentionDays"
            type="number"
            min="0"
            max="365"
            :disabled="!canManage"
          />
        </div>
        <div>
          <p class="tw:text-xs tw:uppercase tw:font-bold tw:text-secondary tw:mb-1">
            Payload retention (days)
          </p>
          <BaseTextInput
            v-model="profile.payloadRetentionDays"
            type="number"
            min="0"
            max="365"
            :disabled="!canManage"
          />
        </div>
      </div>

      <div class="tw:flex tw:justify-end">
        <BaseButton
          v-if="canManage"
          variant="primary"
          size="sm"
          :loading="saving"
          :disabled="saving"
          @click="save"
        >
          Save AI settings
        </BaseButton>
      </div>
    </template>
  </div>
</template>
