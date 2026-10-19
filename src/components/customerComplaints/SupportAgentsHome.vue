<script setup>
import {
  IconHeadphones,
  IconPlus,
  IconPencil,
  IconTrash,
  IconCircleFilled,
  IconPower,
} from '@tabler/icons-vue'
import { get, post, put, del } from '@/api' // Action RPCs (roster + availability are server-computed) — CLAUDE.md rule #4 exception.
import { isAllowed, isVerbAllowed } from '@/utils/currentSession.js'

/**
 * Support Desk → Agents (spec §2.2 / §6): who works the inbox, which brands
 * they serve, their schedule and chat cap, and — live — whether they are
 * available right now. "Available" is the server's answer
 * (support_agent_available), fetched here and refreshed as presence syncs.
 */
const toast = useToast()
const { confirm } = useConfirm()
const canManage = computed(
  () =>
    isAllowed(['complaint_management:manage']) &&
    isVerbAllowed('complaint_management', 'manage_agents'),
)

// Presence rows via sync (so this re-renders when someone toggles status);
// availability + load from the roster endpoint.
const presence = useLiveQuery((db) => db.SupportAgent.where().exec(), {
  models: ['SupportAgent'],
  initial: [],
})
const roster = ref([])
const loading = ref(false)
async function loadRoster() {
  loading.value = true
  try {
    roster.value = (await get('/v1/services/supportDesk/agents')).agents || []
  } catch (e) {
    toast.error(e?.message || 'Could not load agents')
  } finally {
    loading.value = false
  }
}
onMounted(loadRoster)
watch(presence, loadRoster)

const brands = useLiveQuery(
  async (db) => (await db.SupportBrand.where().exec()).sort((a, b) => a.name.localeCompare(b.name)),
  { models: ['SupportBrand'], initial: [] },
)
const brandOptions = computed(() => brands.value.map((b) => ({ value: b.id, label: b.name })))
function brandNames(ids) {
  return (ids || []).map((id) => brands.value.find((b) => b.id === id)?.name).filter(Boolean)
}

const STATUS_DOT = {
  ONLINE: 'tw:text-green-500',
  AWAY: 'tw:text-amber-500',
  OFFLINE: 'tw:text-gray-400',
}
function userName(u) {
  return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email : '—'
}

const showDialog = ref(false)
const editing = ref(null)
const saving = ref(false)
const form = ref(blank())
function blank() {
  return {
    userId: null,
    role: 'AGENT',
    brandIds: brands.value.length === 1 ? [brands.value[0].id] : [],
    maxConcurrentChats: 3,
    schedule: {},
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    notifyMode: 'INSTANT',
  }
}
function openCreate() {
  editing.value = null
  form.value = blank()
  showDialog.value = true
}
function openEdit(a) {
  editing.value = a
  form.value = {
    userId: a.userId,
    role: a.role,
    brandIds: [...(a.brandIds || [])],
    maxConcurrentChats: a.maxConcurrentChats,
    schedule: { ...(a.schedule || {}) },
    timezone: a.timezone,
    notifyMode: a.notifyMode,
  }
  showDialog.value = true
}
async function save() {
  if (!editing.value && !form.value.userId) return toast.error('Pick a user')
  saving.value = true
  const body = {
    ...form.value,
    maxConcurrentChats: Number(form.value.maxConcurrentChats) || 3,
    schedule: Object.keys(form.value.schedule || {}).length ? form.value.schedule : null,
  }
  try {
    if (editing.value) await put(`/v1/services/supportDesk/agents/${editing.value.id}`, body)
    else await post('/v1/services/supportDesk/agents', body)
    showDialog.value = false
    toast.success(editing.value ? 'Agent updated' : 'Agent added')
    await loadRoster()
  } catch (e) {
    toast.error(e?.message || 'Could not save agent')
  } finally {
    saving.value = false
  }
}
async function forceOffline(a) {
  const ok = await confirm({
    title: `Set ${userName(a.user)} offline?`,
    message:
      'They leave the auto-assign pool immediately. Their open chats follow the brand’s re-queue rule.',
    okLabel: 'Set offline',
  })
  if (!ok) return
  try {
    await put(`/v1/services/supportDesk/agents/${a.id}`, {
      manualStatus: 'OFFLINE',
      statusNote: 'Set offline by a lead',
    })
    await loadRoster()
  } catch (e) {
    toast.error(e?.message || 'Could not update')
  }
}
async function remove(a) {
  const ok = await confirm({
    title: 'Remove agent',
    message: `${userName(a.user)} will no longer appear in the roster or receive assignments. Their tickets stay assigned.`,
    okLabel: 'Remove',
    danger: true,
  })
  if (!ok) return
  try {
    await del(`/v1/services/supportDesk/agents/${a.id}`)
    await loadRoster()
  } catch (e) {
    toast.error(e?.message || 'Could not remove agent')
  }
}
</script>

<template>
  <PageSection title="Agents" :icon="IconHeadphones" variant="card">
    <template #actions>
      <BaseButton v-if="canManage" variant="primary" size="sm" @click="openCreate">
        <IconPlus :size="16" class="tw:mr-1" /> Add agent
      </BaseButton>
    </template>
    <p class="tw:text-sm tw:text-secondary tw:mb-4">
      Agents work the inbox. <strong>Available</strong> means: set to Online, inside their schedule,
      recently active in the app, and under their chat limit — that is who auto-assign picks from.
      Leads can set an agent offline.
    </p>

    <div v-if="roster.length" class="tw:flex tw:flex-col tw:gap-2">
      <div
        v-for="a in roster"
        :key="a.id"
        class="tw:flex tw:items-start tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:px-3 tw:py-2"
      >
        <IconCircleFilled
          :size="10"
          class="tw:mt-1.5"
          :class="STATUS_DOT[a.manualStatus] || STATUS_DOT.OFFLINE"
        />
        <div class="tw:min-w-0 tw:flex-1">
          <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:text-sm tw:font-medium">
            {{ userName(a.user) }}
            <BaseBadge v-if="a.role === 'LEAD'" class="tw:bg-indigo-50 tw:text-indigo-700"
              >Lead</BaseBadge
            >
            <BaseBadge v-if="a.available" class="tw:bg-green-50 tw:text-green-700"
              >Available</BaseBadge
            >
            <BaseBadge v-else class="tw:bg-gray-100 tw:text-secondary">{{
              a.manualStatus === 'ONLINE'
                ? 'Online · busy / off-hours'
                : a.manualStatus.toLowerCase()
            }}</BaseBadge>
          </div>
          <div class="tw:text-xs tw:text-secondary">
            {{ a.openTickets }} open ticket{{ a.openTickets === 1 ? '' : 's' }} ·
            {{ a.openChats }}/{{ a.maxConcurrentChats }} chats
            <template v-if="brandNames(a.brandIds).length">
              · {{ brandNames(a.brandIds).join(', ') }}</template
            >
            <template v-else>
              · <span class="tw:text-amber-700">no brands — never auto-assigned</span></template
            >
            <template v-if="a.schedule && Object.keys(a.schedule).length"> · scheduled</template>
          </div>
        </div>
        <template v-if="canManage">
          <button
            v-if="a.manualStatus !== 'OFFLINE'"
            class="tw:text-secondary tw:hover:text-amber-600"
            title="Set offline"
            @click="forceOffline(a)"
          >
            <IconPower :size="16" />
          </button>
          <button class="tw:text-secondary tw:hover:text-primary" title="Edit" @click="openEdit(a)">
            <IconPencil :size="16" />
          </button>
          <button class="tw:text-secondary tw:hover:text-red-600" title="Remove" @click="remove(a)">
            <IconTrash :size="16" />
          </button>
        </template>
      </div>
    </div>
    <div v-else-if="!loading" class="tw:text-sm tw:text-secondary tw:italic">
      No agents yet — add the people who work the inbox.
    </div>

    <BaseDialog
      v-model="showDialog"
      :title="editing ? `Edit ${userName(editing.user)}` : 'Add agent'"
      maxWidth="lg"
    >
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <BaseFieldRow :columns="2">
          <BaseField v-if="!editing" label="User" required>
            <UserSelectMenu v-model="form.userId" required />
          </BaseField>
          <BaseField label="Role">
            <BaseSelect
              v-model="form.role"
              :options="[
                { value: 'AGENT', label: 'Agent' },
                { value: 'LEAD', label: 'Lead' },
              ]"
            />
          </BaseField>
          <BaseField label="Brands served" required>
            <BaseSelect
              v-model="form.brandIds"
              :options="brandOptions"
              multiple
              nullLabel="— Pick brands —"
            />
          </BaseField>
          <BaseField label="Max concurrent chats">
            <BaseTextInput v-model="form.maxConcurrentChats" type="number" min="1" max="50" />
          </BaseField>
          <BaseField label="New-ticket emails">
            <BaseSelect
              v-model="form.notifyMode"
              :options="[
                { value: 'INSTANT', label: 'Instant' },
                { value: 'DIGEST', label: 'Digest (every 15 min)' },
                { value: 'NONE', label: 'None' },
              ]"
            />
          </BaseField>
          <BaseField label="Timezone (for the schedule)">
            <BaseTextInput v-model="form.timezone" placeholder="Europe/Stockholm" />
          </BaseField>
        </BaseFieldRow>
        <BaseField
          label="Personal schedule"
          help="Leave empty to rely on the Online/Away/Offline toggle alone."
        >
          <SupportHoursEditor v-model="form.schedule" />
        </BaseField>
      </div>
      <template #footer="{ close }">
        <BaseDialogFooter
          :submitLabel="editing ? 'Save' : 'Add agent'"
          :loading="saving"
          @cancel="close"
          @submit="save"
        />
      </template>
    </BaseDialog>
  </PageSection>
</template>
