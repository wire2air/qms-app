<script setup>
// Per-user security overview: composite score + stat tiles. Reads the
// aggregated dashboard endpoint. Action RPC — see CLAUDE.md rule #4 exception.
import { get } from '@/api'
import { IconShieldCheck, IconShieldOff, IconKey, IconDevices, IconDeviceDesktop } from '@tabler/icons-vue'

const data = ref(null)

async function load() {
  try {
    data.value = await get('/v1/auth/security/dashboard', { showError: false })
  } catch {
    data.value = null
  }
}
onMounted(load)

const scoreBand = computed(() => {
  const s = data.value?.securityScore ?? 0
  if (s >= 80) return { label: 'Strong', color: 'tw:text-green-600', ring: 'tw:text-green-500' }
  if (s >= 60) return { label: 'Good', color: 'tw:text-lime-600', ring: 'tw:text-lime-500' }
  if (s >= 40) return { label: 'Fair', color: 'tw:text-amber-600', ring: 'tw:text-amber-500' }
  return { label: 'Needs attention', color: 'tw:text-red-600', ring: 'tw:text-red-500' }
})

// Circle geometry for the score ring.
const R = 42
const CIRC = 2 * Math.PI * R
const dash = computed(() => `${(CIRC * (data.value?.securityScore ?? 0)) / 100} ${CIRC}`)

const passwordValue = computed(() => {
  const p = data.value?.passwordHealth
  if (!p) return '—'
  if (p.expired) return 'Expired'
  if (p.expiresInDays != null) return `${p.expiresInDays}d left`
  return 'OK'
})
</script>

<template>
  <BaseCard v-if="data">
    <div class="tw:flex tw:flex-col tw:gap-6 tw:sm:flex-row tw:sm:items-center">
      <!-- Score ring -->
      <div class="tw:flex tw:items-center tw:gap-4">
        <div class="tw:relative tw:size-24 tw:shrink-0">
          <svg class="tw:size-24 tw:-rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" :r="R" fill="none" stroke="currentColor" stroke-width="8" class="tw:text-divider" />
            <circle
              cx="50"
              cy="50"
              :r="R"
              fill="none"
              stroke="currentColor"
              stroke-width="8"
              stroke-linecap="round"
              :stroke-dasharray="dash"
              :class="scoreBand.ring"
            />
          </svg>
          <div class="tw:absolute tw:inset-0 tw:flex tw:flex-col tw:items-center tw:justify-center">
            <span class="tw:text-2xl tw:font-bold tw:text-on-main">{{ data.securityScore }}</span>
            <span class="tw:text-caption tw:text-secondary">/ 100</span>
          </div>
        </div>
        <div>
          <p class="tw:text-sm tw:text-secondary">Security score</p>
          <p class="tw:text-lg tw:font-semibold" :class="scoreBand.color">{{ scoreBand.label }}</p>
        </div>
      </div>

      <!-- Stat tiles -->
      <div class="tw:grid tw:flex-1 tw:grid-cols-2 tw:gap-3 tw:sm:grid-cols-4">
        <BaseStatCard
          label="Two-factor"
          :value="data.mfaStatus?.enrolled ? 'On' : 'Off'"
          :icon="data.mfaStatus?.enrolled ? IconShieldCheck : IconShieldOff"
          :iconColor="data.mfaStatus?.enrolled ? 'green' : 'red'"
        />
        <BaseStatCard
          label="Password"
          :value="passwordValue"
          :icon="IconKey"
          :iconColor="data.passwordHealth?.expired ? 'red' : 'blue'"
        />
        <BaseStatCard label="Sessions" :value="data.sessionsCount" :icon="IconDevices" iconColor="blue" />
        <BaseStatCard label="Devices" :value="data.devicesCount" :icon="IconDeviceDesktop" iconColor="blue" />
      </div>
    </div>
  </BaseCard>
</template>
