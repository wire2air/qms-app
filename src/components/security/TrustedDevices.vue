<script setup>
// Known devices list with remove. Action RPCs (not synced entities).
// Action RPC — see CLAUDE.md rule #4 exception.
import { get, del } from '@/api'
import { IconDeviceDesktop, IconDeviceMobile, IconTrash, IconShieldCheck } from '@tabler/icons-vue'

const toast = useToast()

const devices = ref(null)
const loading = ref(false)
const busy = ref(false)

async function load() {
  try {
    const data = await get('/v1/auth/devices', { loader: loading, showError: false })
    devices.value = data.devices || []
  } catch {
    devices.value = []
  }
}
onMounted(load)

function rel(d) {
  return d?.toRelative?.() ?? String(d ?? '')
}

async function remove(dev) {
  if (busy.value) return
  busy.value = true
  try {
    await del(`/v1/auth/devices/${dev.id}`, { showError: false })
    toast.success('Device removed')
    await load()
  } catch {
    toast.error('Could not remove device')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <BaseCard>
    <div v-if="devices === null" class="tw:flex tw:items-center tw:gap-2 tw:py-4">
      <BaseSpinner size="sm" />
      <span class="tw:text-sm tw:text-secondary">Loading…</span>
    </div>

    <template v-else>
      <ul class="tw:flex tw:flex-col tw:divide-y tw:divide-divider">
        <li v-for="d in devices" :key="d.id" class="tw:flex tw:items-center tw:gap-3 tw:py-3">
          <component
            :is="d.deviceType === 'mobile' || d.deviceType === 'tablet' ? IconDeviceMobile : IconDeviceDesktop"
            :size="20"
            class="tw:shrink-0 tw:text-secondary"
          />
          <div class="tw:min-w-0 tw:flex-1">
            <p class="tw:text-sm tw:font-medium tw:text-on-main">
              {{ d.browser || 'Unknown browser' }}<span v-if="d.os"> · {{ d.os }}</span>
              <BaseBadge v-if="d.trusted" class="tw:ml-2 tw:bg-primary/10 tw:text-primary">
                <IconShieldCheck :size="12" /> Trusted
              </BaseBadge>
            </p>
            <p class="tw:text-caption tw:text-secondary">
              {{ d.ipAddress || 'Unknown IP' }} · last seen {{ rel(d.lastSeenAt) }}
            </p>
          </div>
          <BaseButton
            variant="text"
            size="sm"
            :disabled="busy"
            aria-label="Remove device"
            @click="remove(d)"
          >
            <IconTrash :size="16" />
          </BaseButton>
        </li>
      </ul>

      <p v-if="!devices.length" class="tw:py-4 tw:text-center tw:text-sm tw:text-secondary">
        No devices recorded yet.
      </p>
    </template>
  </BaseCard>
</template>
