<script setup>
// Per-user security overview: composite score ring + compact stat tiles. Reads
// the aggregated dashboard endpoint. Action RPC — see CLAUDE.md rule #4 exception.
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

// Static tint classes so Tailwind emits them.
const TINT = {
  green: { box: 'tw:bg-green-50', text: 'tw:text-green-600' },
  red: { box: 'tw:bg-red-50', text: 'tw:text-red-600' },
  blue: { box: 'tw:bg-blue-50', text: 'tw:text-blue-600' },
}

// Short, non-clipping values for the tiles.
const tiles = computed(() => {
  const d = data.value
  if (!d) return []
  const pw = d.passwordHealth
  const pwValue = pw?.expired ? 'Expired' : pw?.expiresInDays != null ? `${pw.expiresInDays}d` : 'OK'
  const enrolled = !!d.mfaStatus?.enrolled
  return [
    { label: 'Two-factor', value: enrolled ? 'On' : 'Off', icon: enrolled ? IconShieldCheck : IconShieldOff, tint: enrolled ? 'green' : 'red' },
    { label: 'Password', value: pwValue, icon: IconKey, tint: pw?.expired ? 'red' : 'blue' },
    { label: 'Active sessions', value: d.sessionsCount ?? 0, icon: IconDevices, tint: 'blue' },
    { label: 'Devices', value: d.devicesCount ?? 0, icon: IconDeviceDesktop, tint: 'blue' },
  ]
})
</script>

<template>
  <BaseCard v-if="data">
    <div class="tw:flex tw:flex-col tw:gap-5 tw:lg:flex-row tw:lg:items-center">
      <!-- Score ring -->
      <div
        class="tw:flex tw:items-center tw:gap-4 tw:lg:w-60 tw:lg:shrink-0 tw:lg:border-r tw:lg:border-divider tw:lg:pr-6"
      >
        <div class="tw:relative tw:size-20 tw:shrink-0">
          <svg class="tw:size-20 tw:-rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" :r="R" fill="none" stroke="currentColor" stroke-width="9" class="tw:text-divider" />
            <circle
              cx="50"
              cy="50"
              :r="R"
              fill="none"
              stroke="currentColor"
              stroke-width="9"
              stroke-linecap="round"
              :stroke-dasharray="dash"
              :class="scoreBand.ring"
            />
          </svg>
          <div class="tw:absolute tw:inset-0 tw:flex tw:flex-col tw:items-center tw:justify-center">
            <span class="tw:text-xl tw:font-bold tw:text-on-main tw:leading-none">{{ data.securityScore }}</span>
            <span class="tw:text-caption tw:text-secondary">/ 100</span>
          </div>
        </div>
        <div>
          <p class="tw:text-sm tw:text-secondary">Security score</p>
          <p class="tw:text-lg tw:font-semibold" :class="scoreBand.color">{{ scoreBand.label }}</p>
        </div>
      </div>

      <!-- Stat tiles: 2×2 on small screens, 4-across only when there's room -->
      <div class="tw:grid tw:flex-1 tw:grid-cols-2 tw:gap-3 tw:lg:grid-cols-4">
        <div
          v-for="t in tiles"
          :key="t.label"
          class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2.5"
        >
          <div
            class="tw:flex tw:size-9 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-lg"
            :class="TINT[t.tint].box"
          >
            <component :is="t.icon" :size="18" :class="TINT[t.tint].text" aria-hidden="true" />
          </div>
          <div class="tw:min-w-0">
            <div class="tw:text-base tw:font-semibold tw:text-on-main tw:leading-tight">{{ t.value }}</div>
            <div class="tw:truncate tw:text-caption tw:text-secondary">{{ t.label }}</div>
          </div>
        </div>
      </div>
    </div>
  </BaseCard>
</template>
