<script setup>
// Live password feedback: a strength bar (server zxcvbn score) + a policy
// checklist (from the tenant's rules). The server is authoritative — the bar
// and `valid` come from POST /v1/auth/password/validate; the checklist is
// computed client-side for instant ticks. Breach/history are only enforced on
// the real submit (surfaced there as a 422), not here.
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, post } from '@/api'
import { IconCheck, IconX } from '@tabler/icons-vue'

const props = defineProps({
  // Email/name fragments the strength check should penalise (forwarded to the
  // server validate call, which drops them if unused).
  userInputs: { type: Array, default: () => [] },
  // Render the requirements checklist even while the password is empty (used
  // by popover placements that show "what a valid password needs" up front).
  // The strength bar still waits for input.
  showEmpty: { type: Boolean, default: false },
})

const emit = defineEmits(['update:valid'])
const password = defineModel({ type: String, default: '' })

const policy = ref(null)
const score = ref(0)
const meetsPolicy = ref(false)

onMounted(async () => {
  try {
    const data = await get('/v1/auth/password/policy', { showError: false })
    policy.value = data.policy
  } catch {
    policy.value = { minLength: 8, requireUpper: true, requireLower: true, requireNumber: true, requireSymbol: false }
  }
})

// Structural checks — instant, client-verifiable (length + character classes).
const structuralChecks = computed(() => {
  const p = policy.value
  const pw = password.value || ''
  if (!p) return []
  const list = [{ label: `At least ${p.minLength} characters`, ok: pw.length >= p.minLength }]
  if (p.requireUpper) list.push({ label: 'An uppercase letter', ok: /[A-Z]/.test(pw) })
  if (p.requireLower) list.push({ label: 'A lowercase letter', ok: /[a-z]/.test(pw) })
  if (p.requireNumber) list.push({ label: 'A number', ok: /[0-9]/.test(pw) })
  if (p.requireSymbol) list.push({ label: 'A symbol', ok: /[^A-Za-z0-9]/.test(pw) })
  return list
})

// Full checklist shown to the user. Adds the strength requirement when the
// policy enforces one — otherwise a password can pass every structural check
// yet still be rejected as "too weak", with no visible reason (which reads as a
// dead submit button). `score` comes from the server validate call.
const checks = computed(() => {
  const p = policy.value
  if (!p) return []
  const list = [...structuralChecks.value]
  if (p.minStrengthScore > 0) {
    list.push({
      label: 'Not too weak or predictable',
      ok: (password.value || '').length > 0 && score.value >= p.minStrengthScore,
    })
  }
  return list
})

const STRENGTH = [
  { label: 'Very weak', class: 'tw:bg-red-500', text: 'tw:text-red-600' },
  { label: 'Weak', class: 'tw:bg-red-500', text: 'tw:text-red-600' },
  { label: 'Fair', class: 'tw:bg-amber-500', text: 'tw:text-amber-600' },
  { label: 'Good', class: 'tw:bg-lime-500', text: 'tw:text-lime-600' },
  { label: 'Strong', class: 'tw:bg-green-600', text: 'tw:text-green-700' },
]
const strength = computed(() => STRENGTH[Math.max(0, Math.min(4, score.value))])

// Debounced server validation drives the bar + the authoritative `valid`.
const runValidate = useDebounceFn(async () => {
  if (!password.value) {
    score.value = 0
    meetsPolicy.value = false
    emit('update:valid', false)
    return
  }
  try {
    const data = await post(
      '/v1/auth/password/validate',
      { candidate: password.value, userInputs: props.userInputs },
      { showError: false },
    )
    score.value = data.score ?? 0
    meetsPolicy.value = !!data.meetsPolicy
    emit('update:valid', meetsPolicy.value)
  } catch {
    // On a validation-endpoint hiccup, fall back to the structural checks only
    // — the strength item needs the server score, so don't block on it here.
    const ok = structuralChecks.value.every((c) => c.ok)
    meetsPolicy.value = ok
    emit('update:valid', ok)
  }
}, 300)

watch(password, runValidate, { immediate: true })
</script>

<template>
  <div v-if="password || showEmpty" class="tw:flex tw:flex-col tw:gap-2">
    <!-- Strength bar -->
    <div v-if="password" class="tw:flex tw:items-center tw:gap-2">
      <div class="tw:flex tw:h-1.5 tw:flex-1 tw:gap-1">
        <div
          v-for="i in 4"
          :key="i"
          class="tw:h-full tw:flex-1 tw:rounded-full tw:transition-colors"
          :class="i <= score ? strength.class : 'tw:bg-divider'"
        />
      </div>
      <span class="tw:text-caption tw:font-medium" :class="strength.text">{{ strength.label }}</span>
    </div>

    <!-- Policy checklist -->
    <ul class="tw:flex tw:flex-col tw:gap-1">
      <li
        v-for="c in checks"
        :key="c.label"
        class="tw:flex tw:items-center tw:gap-1.5 tw:text-caption"
        :class="c.ok ? 'tw:text-green-600' : 'tw:text-secondary'"
      >
        <IconCheck v-if="c.ok" :size="14" class="tw:shrink-0" />
        <IconX v-else :size="14" class="tw:shrink-0 tw:text-secondary" />
        {{ c.label }}
      </li>
    </ul>
  </div>
</template>
