<script setup>
/**
 * Company Settings → Integrations. Connect this company's own Adobe Acrobat
 * Sign account via OAuth (the platform owns one OAuth app; each company
 * authorizes it against their account). The encrypted refresh token lives
 * server-side; this card only ever sees non-secret status.
 */
import { IconPlug, IconCircleCheck, IconExternalLink, IconRefresh } from '@tabler/icons-vue'
// Action RPCs (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, del } from '@/api'

const toast = useToast()
const route = useRoute()
const router = useRouter()

const status = ref(null)
const loading = ref(true)
const busy = ref(false)

async function loadStatus() {
  loading.value = true
  try {
    status.value = await get('/v1/services/integrations/adobe-sign/status')
  } catch (err) {
    toast.error(err?.message || 'Failed to load integration status')
  } finally {
    loading.value = false
  }
}

async function connect() {
  if (busy.value) return
  busy.value = true
  try {
    const res = await get('/v1/services/integrations/adobe-sign/authorize')
    if (res?.url) window.location.href = res.url
  } catch (err) {
    toast.error(err?.message || 'Could not start Adobe Sign connection')
    busy.value = false
  }
}

async function disconnect() {
  if (busy.value) return
  busy.value = true
  try {
    await del('/v1/services/integrations/adobe-sign')
    toast.success('Adobe Sign disconnected')
    await loadStatus()
  } catch (err) {
    toast.error(err?.message || 'Failed to disconnect')
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  // Surface the OAuth round-trip result, then strip the query params.
  if (route.query.adobeSign === 'connected') {
    toast.success('Adobe Sign connected')
  } else if (route.query.adobeSign === 'error') {
    toast.error(route.query.message || 'Adobe Sign connection failed')
  }
  if (route.query.adobeSign) {
    const q = { ...route.query }
    delete q.adobeSign
    delete q.message
    router.replace({ query: q })
  }
  loadStatus()
})
</script>

<template>
  <div class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden tw:max-w-2xl">
    <div class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:gap-3">
      <div class="tw:w-10 tw:h-10 tw:rounded-lg tw:bg-gray-100 tw:flex tw:items-center tw:justify-center">
        <IconPlug :size="20" class="tw:text-secondary" />
      </div>
      <div>
        <h3 class="tw:text-lg tw:font-bold tw:text-on-main">Adobe Acrobat Sign</h3>
        <p class="tw:text-xs tw:text-secondary">
          E-sign controlled documents through your own Adobe account.
        </p>
      </div>
    </div>

    <div class="tw:p-6">
      <div v-if="loading" class="tw:text-sm tw:text-secondary">Loading…</div>

      <div v-else-if="status && !status.configured" class="tw:text-sm tw:text-secondary">
        Adobe Sign isn't configured on this server yet. Ask your administrator to set the platform
        Adobe OAuth credentials.
      </div>

      <div v-else-if="status?.connected" class="tw:flex tw:flex-col tw:gap-3">
        <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:text-green-700">
          <IconCircleCheck :size="18" />
          <span class="tw:font-semibold">Connected</span>
          <span v-if="status.accountEmail" class="tw:text-secondary tw:font-normal">
            · {{ status.accountEmail }}
          </span>
        </div>
        <div class="tw:flex tw:items-center tw:gap-2">
          <BaseButton variant="outline" size="sm" :loading="busy" @click="connect">
            <IconRefresh :size="14" class="tw:mr-1" /> Reconnect
          </BaseButton>
          <BaseButton variant="outline" size="sm" :loading="busy" @click="disconnect">
            Disconnect
          </BaseButton>
        </div>
      </div>

      <div v-else class="tw:flex tw:flex-col tw:gap-3">
        <p class="tw:text-sm tw:text-secondary">
          Not connected. Connect your Adobe account so document workflow steps flagged for Adobe
          e-signature can route signatures through it.
        </p>
        <BaseButton variant="primary" size="sm" :loading="busy" class="tw:self-start" @click="connect">
          <IconExternalLink :size="14" class="tw:mr-1" /> Connect Adobe Sign
        </BaseButton>
      </div>
    </div>
  </div>
</template>
