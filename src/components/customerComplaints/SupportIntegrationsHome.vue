<script setup>
/**
 * Complaint Settings → Integrations. Connect third-party support desks
 * (Zendesk first) so their tickets sync in as customer complaints and status /
 * replies sync back. Provider cards + capabilities are driven by the backend
 * registry (`GET /integrations/providers`); secrets live server-side and are
 * never returned here — this UI only ever sees non-secret status.
 */
import {
  IconPlug,
  IconCircleCheck,
  IconAlertTriangle,
  IconRefresh,
  IconPlugConnected,
} from '@tabler/icons-vue'
// Action RPCs (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, post, del } from '@/api'

const toast = useToast()

const providers = ref([])
const statuses = ref({}) // key -> status object
const loading = ref(true)
const busyKey = ref(null)

const dialog = ref({ open: false, meta: null, form: {}, saving: false, error: '' })

function urlKey(meta) {
  return String(meta.key).toLowerCase()
}

async function loadStatus(meta) {
  try {
    statuses.value[meta.key] = await get(`/v1/services/integrations/${urlKey(meta)}/status`)
  } catch {
    statuses.value[meta.key] = { provider: meta.key, connected: false, status: 'DISCONNECTED' }
  }
}

async function loadAll() {
  loading.value = true
  try {
    const res = await get('/v1/services/integrations/providers')
    providers.value = res?.providers || []
    await Promise.all(providers.value.map((m) => loadStatus(m)))
  } catch (err) {
    toast.error(err?.message || 'Failed to load integrations')
  } finally {
    loading.value = false
  }
}

function openConnect(meta) {
  const form = {}
  for (const f of meta.configFields || []) form[f.name] = ''
  dialog.value = { open: true, meta, form, saving: false, error: '' }
}

async function submitConnect() {
  const { meta, form } = dialog.value
  dialog.value.saving = true
  dialog.value.error = ''
  try {
    await post(`/v1/services/integrations/${urlKey(meta)}/connect`, form)
    toast.success(`${meta.displayName} connected`)
    dialog.value.open = false
    await loadStatus(meta)
  } catch (err) {
    dialog.value.error = err?.message || 'Connection failed'
  } finally {
    dialog.value.saving = false
  }
}

async function testConnection(meta) {
  busyKey.value = meta.key
  try {
    const res = await post(`/v1/services/integrations/${urlKey(meta)}/test`, {})
    if (res?.ok) toast.success(`${meta.displayName} connection is healthy`)
    else toast.error(res?.error || 'Connection test failed')
    await loadStatus(meta)
  } catch (err) {
    toast.error(err?.message || 'Connection test failed')
  } finally {
    busyKey.value = null
  }
}

async function disconnect(meta) {
  busyKey.value = meta.key
  try {
    await del(`/v1/services/integrations/${urlKey(meta)}`)
    toast.success(`${meta.displayName} disconnected`)
    await loadStatus(meta)
  } catch (err) {
    toast.error(err?.message || 'Failed to disconnect')
  } finally {
    busyKey.value = null
  }
}

onMounted(loadAll)
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4 tw:max-w-3xl">
    <div class="tw:flex tw:items-start tw:gap-2">
      <IconPlug :size="20" class="tw:text-secondary tw:mt-0.5" />
      <div>
        <h3 class="tw:font-semibold">Support desk integrations</h3>
        <p class="tw:text-sm tw:text-secondary">
          Connect a third-party support desk to sync its tickets in as customer complaints — routed,
          SLA-tracked, and convertible to nonconformances like any complaint.
        </p>
      </div>
    </div>

    <div v-if="loading" class="tw:text-sm tw:text-secondary">Loading…</div>

    <div
      v-for="meta in providers"
      v-else
      :key="meta.key"
      class="tw:bg-sidebar tw:rounded-xl tw:border tw:border-divider tw:overflow-hidden"
    >
      <div class="tw:px-6 tw:py-4 tw:border-b tw:border-divider tw:bg-main-hover tw:flex tw:items-center tw:justify-between">
        <div class="tw:flex tw:items-center tw:gap-2">
          <IconPlug :size="18" class="tw:text-secondary" />
          <span class="tw:font-semibold">{{ meta.displayName }}</span>
        </div>
        <span
          v-if="statuses[meta.key]?.connected"
          class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-green-700"
        >
          <IconCircleCheck :size="14" /> Connected
        </span>
      </div>

      <div class="tw:p-6 tw:flex tw:flex-col tw:gap-3">
        <p class="tw:text-sm tw:text-secondary">{{ meta.description }}</p>

        <template v-if="statuses[meta.key]?.connected">
          <div class="tw:flex tw:flex-wrap tw:gap-x-6 tw:gap-y-1 tw:text-sm">
            <div v-if="statuses[meta.key].accountEmail">
              <span class="tw:text-secondary">Account:</span> {{ statuses[meta.key].accountEmail }}
            </div>
            <div v-if="statuses[meta.key].externalSubdomain">
              <span class="tw:text-secondary">Subdomain:</span> {{ statuses[meta.key].externalSubdomain }}
            </div>
            <div>
              <span class="tw:text-secondary">Sync:</span>
              <span
                :class="statuses[meta.key].syncState === 'HEALTHY' ? 'tw:text-green-700' : 'tw:text-amber-700'"
              >
                {{ statuses[meta.key].syncState || '—' }}
              </span>
            </div>
          </div>
          <div
            v-if="statuses[meta.key].lastError"
            class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-red-600"
          >
            <IconAlertTriangle :size="14" /> {{ statuses[meta.key].lastError }}
          </div>
          <div class="tw:flex tw:items-center tw:gap-2">
            <BaseButton variant="outline" size="sm" :loading="busyKey === meta.key" @click="testConnection(meta)">
              <IconRefresh :size="14" class="tw:mr-1" /> Test
            </BaseButton>
            <BaseButton variant="outline" size="sm" :loading="busyKey === meta.key" @click="openConnect(meta)">
              Reconnect
            </BaseButton>
            <BaseButton variant="outline" size="sm" :loading="busyKey === meta.key" @click="disconnect(meta)">
              Disconnect
            </BaseButton>
          </div>
        </template>

        <template v-else>
          <BaseButton variant="primary" size="sm" class="tw:self-start" @click="openConnect(meta)">
            <IconPlugConnected :size="14" class="tw:mr-1" /> Connect {{ meta.displayName }}
          </BaseButton>
        </template>
      </div>
    </div>

    <!-- Connect dialog — fields driven by the provider's configFields -->
    <BaseDialog v-model="dialog.open" :title="`Connect ${dialog.meta?.displayName || ''}`" maxWidth="md">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div v-for="field in dialog.meta?.configFields || []" :key="field.name" class="tw:flex tw:flex-col tw:gap-1">
          <label class="tw:text-sm tw:font-medium">
            {{ field.label }}<span v-if="field.required" class="tw:text-red-500">*</span>
          </label>
          <BaseTextInput
            v-model="dialog.form[field.name]"
            :type="field.type === 'password' ? 'password' : 'text'"
            :placeholder="field.help || ''"
          />
          <p v-if="field.help" class="tw:text-xs tw:text-secondary">{{ field.help }}</p>
        </div>
        <p v-if="dialog.error" class="tw:text-sm tw:text-red-600">{{ dialog.error }}</p>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          submitLabel="Connect"
          :loading="dialog.saving"
          @cancel="close"
          @submit="submitConnect"
        />
      </template>
    </BaseDialog>
  </div>
</template>
