<script setup>
import {
  IconTag,
  IconPlus,
  IconPencil,
  IconTrash,
  IconKey,
  IconStar,
  IconCopy,
} from '@tabler/icons-vue'
import { get, post, put, del } from '@/api' // Action RPCs (brand writes mint keys / enforce one default) — CLAUDE.md rule #4 exception.
import { isAllowed, isVerbAllowed } from '@/utils/currentSession.js'

/**
 * Support Desk → Brands (spec §2.1 / §8). One tenant, several brands: each
 * with its own outbound identity, email channel, allowed website origins,
 * business hours, assignment switches and (Phase 2) widget key + auto-messages.
 */
const toast = useToast()
const { confirm } = useConfirm()
const canManage = computed(
  () =>
    isAllowed(['complaint_management:manage']) &&
    isVerbAllowed('complaint_management', 'manage_brands'),
)

const brands = useLiveQuery(
  async (db) =>
    (await db.SupportBrand.where().exec()).sort(
      (a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name),
    ),
  { models: ['SupportBrand'], initial: [] },
)
// Email channels have no client model — same REST list EmailChannelsHome uses.
const channels = ref([])
onMounted(async () => {
  try {
    const res = await get('/v1/services/customerComplaints/emailChannels')
    channels.value = res?.channels ?? res?.emailChannels ?? (Array.isArray(res) ? res : [])
  } catch {
    channels.value = []
  }
})
const channelOptions = computed(() =>
  channels.value.map((c) => ({ value: c.id, label: c.publicEmail || c.localPart || 'Channel' })),
)
function channelLabel(id) {
  return channelOptions.value.find((c) => c.value === id)?.label ?? '—'
}

const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone').map((z) => ({ value: z, label: z }))
  } catch {
    return [
      'UTC',
      'Europe/London',
      'Europe/Stockholm',
      'America/New_York',
      'America/Los_Angeles',
      'Asia/Kolkata',
    ].map((z) => ({ value: z, label: z }))
  }
})()

const showDialog = ref(false)
const editing = ref(null)
const saving = ref(false)
const form = ref(blank())
const originsText = ref('')
function blank() {
  return {
    name: '',
    slug: '',
    fromName: '',
    fromEmail: '',
    defaultChannelId: null,
    accentColor: '#1f6feb',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    businessHours: {},
    autoAssign: true,
    autoAssignEmail: false,
    requeueChatOnOffline: true,
    fallbackEmail: '',
    unansweredAlertMinutes: 5,
    stateId: 'ACTIVE',
  }
}
function openCreate() {
  editing.value = null
  form.value = blank()
  originsText.value = ''
  showDialog.value = true
}
function openEdit(b) {
  editing.value = b
  form.value = {
    name: b.name,
    slug: b.slug,
    fromName: b.fromName || '',
    fromEmail: b.fromEmail || '',
    defaultChannelId: b.defaultChannelId,
    accentColor: b.accentColor || '#1f6feb',
    timezone: b.timezone || 'UTC',
    businessHours: { ...(b.businessHours || {}) },
    autoAssign: b.autoAssign,
    autoAssignEmail: b.autoAssignEmail,
    requeueChatOnOffline: b.requeueChatOnOffline,
    fallbackEmail: b.fallbackEmail || '',
    unansweredAlertMinutes: b.unansweredAlertMinutes ?? 5,
    stateId: b.stateId,
  }
  originsText.value = (b.allowedOrigins || []).join('\n')
  showDialog.value = true
}
function payload() {
  const origins = originsText.value
    .split(/[\n,\s]+/)
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return {
    ...form.value,
    name: form.value.name.trim(),
    slug: form.value.slug.trim() || undefined,
    fromName: form.value.fromName.trim() || null,
    fromEmail: form.value.fromEmail.trim() || null,
    fallbackEmail: form.value.fallbackEmail.trim() || null,
    unansweredAlertMinutes: Number(form.value.unansweredAlertMinutes) || 5,
    allowedOrigins: origins,
  }
}
async function save() {
  if (!form.value.name.trim()) return toast.error('Name is required')
  saving.value = true
  try {
    if (editing.value) await put(`/v1/services/supportDesk/brands/${editing.value.id}`, payload())
    else await post('/v1/services/supportDesk/brands', payload())
    showDialog.value = false
    toast.success(editing.value ? 'Brand updated' : 'Brand created')
  } catch (e) {
    toast.error(e?.message || 'Could not save brand')
  } finally {
    saving.value = false
  }
}
async function makeDefault(b) {
  try {
    await post(`/v1/services/supportDesk/brands/${b.id}/setDefault`, {})
    toast.success(`${b.name} is now the default brand`)
  } catch (e) {
    toast.error(e?.message || 'Could not set default')
  }
}
async function rotateKey(b) {
  const ok = await confirm({
    title: 'Rotate widget key?',
    message: `Any site still embedding the current key for ${b.name} stops working until it is updated.`,
    okLabel: 'Rotate',
    danger: true,
  })
  if (!ok) return
  try {
    await post(`/v1/services/supportDesk/brands/${b.id}/rotateKey`, {})
    toast.success('New key minted')
  } catch (e) {
    toast.error(e?.message || 'Could not rotate key')
  }
}
async function remove(b) {
  const ok = await confirm({
    title: 'Delete brand',
    message: `Delete ${b.name}? Closed tickets, channels and forms move to the default brand.`,
    okLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  try {
    await del(`/v1/services/supportDesk/brands/${b.id}`)
    toast.success('Brand deleted')
  } catch (e) {
    toast.error(e?.message || 'Could not delete brand')
  }
}
async function copyKey(b) {
  try {
    await navigator.clipboard.writeText(b.publishableKey)
    toast.success('Key copied')
  } catch {
    toast.error('Copy failed — select the key and copy it manually')
  }
}
</script>

<template>
  <PageSection title="Brands" :icon="IconTag" variant="card">
    <template #actions>
      <BaseButton v-if="canManage" variant="primary" size="sm" @click="openCreate">
        <IconPlus :size="16" class="tw:mr-1" /> New brand
      </BaseButton>
    </template>
    <p class="tw:text-sm tw:text-secondary tw:mb-4">
      A brand is the identity tickets are handled under: outbound name and email, default email
      channel, business hours and assignment rules. Each brand gets its own chat-widget key.
    </p>

    <div class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="b in brands"
        :key="b.id"
        class="tw:flex tw:items-start tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2"
      >
        <span
          class="tw:mt-1 tw:inline-block tw:h-3 tw:w-3 tw:shrink-0 tw:rounded-full"
          :style="{ background: b.accentColor || '#999' }"
        />
        <div class="tw:min-w-0 tw:flex-1">
          <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:text-sm tw:font-medium">
            {{ b.name }}
            <BaseBadge v-if="b.isDefault" class="tw:bg-amber-50 tw:text-amber-700"
              >Default</BaseBadge
            >
            <BaseBadge v-if="b.stateId !== 'ACTIVE'" class="tw:bg-gray-100 tw:text-secondary"
              >Inactive</BaseBadge
            >
          </div>
          <div class="tw:text-xs tw:text-secondary">
            {{ b.fromEmail || channelLabel(b.defaultChannelId) }} · {{ b.timezone }} ·
            {{ b.autoAssign ? 'auto-assign chat' : 'manual chat'
            }}{{ b.autoAssignEmail ? ' + email' : '' }}
            <template v-if="b.allowedOrigins?.length">
              · {{ b.allowedOrigins.length }} origin{{
                b.allowedOrigins.length === 1 ? '' : 's'
              }}</template
            >
          </div>
          <div
            class="tw:mt-1 tw:flex tw:items-center tw:gap-1 tw:font-mono tw:text-xs tw:text-secondary"
          >
            <IconKey :size="12" /> {{ b.publishableKey }}
            <button
              type="button"
              class="tw:text-secondary tw:hover:text-primary"
              aria-label="Copy key"
              @click="copyKey(b)"
            >
              <IconCopy :size="12" />
            </button>
          </div>
        </div>
        <template v-if="canManage">
          <button
            v-if="!b.isDefault"
            class="tw:text-secondary tw:hover:text-amber-600"
            title="Make default"
            @click="makeDefault(b)"
          >
            <IconStar :size="16" />
          </button>
          <button
            class="tw:text-secondary tw:hover:text-primary"
            title="Rotate widget key"
            @click="rotateKey(b)"
          >
            <IconKey :size="16" />
          </button>
          <button class="tw:text-secondary tw:hover:text-primary" title="Edit" @click="openEdit(b)">
            <IconPencil :size="16" />
          </button>
          <button
            v-if="!b.isDefault"
            class="tw:text-secondary tw:hover:text-red-600"
            title="Delete"
            @click="remove(b)"
          >
            <IconTrash :size="16" />
          </button>
        </template>
      </div>
    </div>

    <BaseDialog
      v-model="showDialog"
      :title="editing ? `Edit ${editing.name}` : 'New brand'"
      maxWidth="lg"
    >
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <BaseFieldRow :columns="2">
          <BaseField label="Name" required><BaseTextInput v-model="form.name" /></BaseField>
          <BaseField label="Slug"
            ><BaseTextInput v-model="form.slug" placeholder="auto from name"
          /></BaseField>
          <BaseField label="From name"
            ><BaseTextInput v-model="form.fromName" placeholder="Acme Support"
          /></BaseField>
          <BaseField label="From email"
            ><BaseTextInput v-model="form.fromEmail" placeholder="support@acme.com"
          /></BaseField>
          <BaseField label="Default email channel">
            <BaseSelect
              v-model="form.defaultChannelId"
              :options="channelOptions"
              nullLabel="— None —"
              clearable
            />
          </BaseField>
          <BaseField label="Timezone">
            <BaseSelect v-model="form.timezone" :options="TIMEZONES" searchable />
          </BaseField>
          <BaseField label="Accent colour">
            <BaseColorPicker v-model="form.accentColor" />
          </BaseField>
          <BaseField label="Status">
            <BaseSelect
              v-model="form.stateId"
              :options="[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
              ]"
            />
          </BaseField>
        </BaseFieldRow>

        <BaseField
          label="Allowed website origins (one per line)"
          help="Where the chat widget may load from, e.g. https://www.acme.com"
        >
          <BaseTextarea
            v-model="originsText"
            :rows="3"
            placeholder="https://www.acme.com&#10;https://help.acme.com"
          />
        </BaseField>

        <BaseField label="Business hours">
          <SupportHoursEditor v-model="form.businessHours" />
        </BaseField>

        <BaseFieldRow :columns="2">
          <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm"
            ><BaseCheckbox v-model="form.autoAssign" /> Auto-assign new chats</label
          >
          <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm"
            ><BaseCheckbox v-model="form.autoAssignEmail" /> Auto-assign email / form tickets</label
          >
          <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm"
            ><BaseCheckbox v-model="form.requeueChatOnOffline" /> Re-queue open chats when an agent
            goes offline</label
          >
          <BaseField label="Unanswered chat alert after (minutes)">
            <BaseTextInput v-model="form.unansweredAlertMinutes" type="number" min="1" max="1440" />
          </BaseField>
          <BaseField label="Fallback email (nobody online)">
            <BaseTextInput v-model="form.fallbackEmail" placeholder="support-lead@acme.com" />
          </BaseField>
        </BaseFieldRow>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          :submitLabel="editing ? 'Save' : 'Create brand'"
          :loading="saving"
          @cancel="close"
          @submit="save"
        />
      </template>
    </BaseDialog>
  </PageSection>
</template>
