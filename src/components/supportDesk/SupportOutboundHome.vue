<script setup>
import {
  IconPlus,
  IconPlayerPlay,
  IconPlayerPause,
  IconTrash,
  IconPencil,
  IconSpeakerphone,
  IconDotsVertical,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { post, put, del } from '@/api'
import { isAllowed, isVerbAllowed, currentSession } from '@/utils/currentSession.js'

/**
 * Outbound (proactive) chat messages — Support Desk Phase C. Rows come from
 * the sync engine; writes go through /supportDesk/outbound so rules are
 * validated and state changes audited server-side. The editor shows a live
 * preview of the teaser as the website visitor will see it.
 */
const toast = useToast()
const { confirm } = useConfirm()
const canManage = computed(
  () =>
    isAllowed(['complaint_management:manage']) &&
    isVerbAllowed('complaint_management', 'manage_brands'),
)

const rows = useLiveQuery(
  async (db) =>
    (await db.SupportOutboundMessage.where().exec()).sort(
      (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    ),
  { models: ['SupportOutboundMessage'], initial: [] },
)
const brands = useLiveQuery(
  async (db) =>
    (await db.SupportBrand.where().exec()).sort(
      (a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.name.localeCompare(b.name),
    ),
  { models: ['SupportBrand'], initial: [] },
)
const brandName = (id) => brands.value.find((b) => b.id === id)?.name || '—'

// ── Editor ──────────────────────────────────────────────────────────────────
const URL_OPS = [
  { id: 'any', name: 'Any page' },
  { id: 'starts_with', name: 'URL starts with' },
  { id: 'contains', name: 'URL contains' },
  { id: 'equals', name: 'URL is exactly' },
]
const AUDIENCES = [
  { id: 'ALL', name: 'Everyone' },
  { id: 'VISITORS', name: 'Visitors (anonymous)' },
  { id: 'LEADS', name: 'Leads (email known, not signed in)' },
  { id: 'USERS', name: 'Users (identified by your site)' },
]
const VISITOR_KINDS = [
  { id: 'ANY', name: 'First-time and returning' },
  { id: 'FIRST_SEEN', name: 'First visit only' },
  { id: 'RETURNING', name: 'Returning visitors only' },
]
const SENT_AS = [
  { id: 'SNIPPET', name: 'Snippet', hint: 'First lines beside the launcher, with a reply box' },
  { id: 'FULL', name: 'Full message', hint: 'The whole message beside the launcher' },
  { id: 'BADGE', name: 'Badge', hint: 'Just a “1” on the launcher; shows when opened' },
]
const REPLY_TYPES = [
  { id: 'TEXT', name: 'Text reply — opens a chat' },
  { id: 'EMAIL_COLLECTOR', name: 'Email collector — asks for an address' },
]
const FREQUENCIES = [
  { id: 'ONCE', name: 'Once per visitor' },
  { id: 'EVERY_MATCH', name: 'Every time the rules match' },
]

function blank() {
  return {
    id: null,
    brandId: brands.value[0]?.id || null,
    name: '',
    fromUserId: currentSession.value?.userId || null,
    assignRepliesToUserId: null,
    contentHtml: '',
    replyType: 'TEXT',
    sentAs: 'SNIPPET',
    frequency: 'ONCE',
    startsAt: null,
    endsAt: null,
    rules: {
      url: { op: 'any', value: '' },
      audience: 'ALL',
      visitorKind: 'ANY',
      delaySeconds: 5,
      officeHoursOnly: false,
    },
  }
}
const editorOpen = ref(false)
const form = ref(blank())
const saving = ref(false)

function openNew() {
  form.value = blank()
  editorOpen.value = true
}
function openEdit(r) {
  form.value = {
    id: r.id,
    brandId: r.brandId,
    name: r.name,
    fromUserId: r.fromUserId,
    assignRepliesToUserId: r.assignRepliesToUserId,
    contentHtml: r.contentHtml || '',
    replyType: r.replyType,
    sentAs: r.sentAs,
    frequency: r.frequency,
    startsAt: r.startsAt || null,
    endsAt: r.endsAt || null,
    rules: {
      url: { op: r.rules?.url?.op || 'any', value: r.rules?.url?.value || '' },
      audience: r.rules?.audience || 'ALL',
      visitorKind: r.rules?.visitorKind || 'ANY',
      delaySeconds: r.rules?.delaySeconds ?? 5,
      officeHoursOnly: !!r.rules?.officeHoursOnly,
    },
  }
  editorOpen.value = true
}
const previewText = computed(() => {
  const doc = new DOMParser().parseFromString(form.value.contentHtml || '', 'text/html')
  return (doc.body.textContent || '').trim()
})
const fromUser = useLiveQueryWithDeps(
  [() => form.value.fromUserId],
  async (db, [id]) => (id ? db.User.findByPk(id) : null),
  { models: ['User'], initial: null },
)
const fromName = computed(() =>
  fromUser.value
    ? [fromUser.value.firstName, fromUser.value.lastName].filter(Boolean).join(' ')
    : 'Support',
)
const accent = computed(
  () => brands.value.find((b) => b.id === form.value.brandId)?.accentColor || '#1f6feb',
)

async function save() {
  if (saving.value) return
  if (!form.value.name.trim()) return toast.error('Give the message a name')
  if (!previewText.value) return toast.error('Write the message')
  saving.value = true
  try {
    const body = {
      brandId: form.value.brandId,
      name: form.value.name.trim(),
      fromUserId: form.value.fromUserId,
      assignRepliesToUserId: form.value.assignRepliesToUserId,
      contentHtml: form.value.contentHtml,
      replyType: form.value.replyType,
      sentAs: form.value.sentAs,
      frequency: form.value.frequency,
      rules: { ...form.value.rules, delaySeconds: Number(form.value.rules.delaySeconds) || 0 },
      startsAt: form.value.startsAt?.toISO
        ? form.value.startsAt.toISO()
        : form.value.startsAt || null,
      endsAt: form.value.endsAt?.toISO ? form.value.endsAt.toISO() : form.value.endsAt || null,
    }
    if (form.value.id) await put(`/v1/services/supportDesk/outbound/${form.value.id}`, body)
    else await post('/v1/services/supportDesk/outbound', body)
    editorOpen.value = false
    toast.success('Saved')
  } catch (e) {
    toast.error(e?.message || 'Could not save')
  } finally {
    saving.value = false
  }
}
async function setState(r, state) {
  try {
    await post(`/v1/services/supportDesk/outbound/${r.id}/state`, { state })
    toast.success(
      state === 'LIVE' ? 'Message is live' : state === 'PAUSED' ? 'Paused' : 'Back to draft',
    )
  } catch (e) {
    toast.error(e?.message || 'Could not change state')
  }
}
async function remove(r) {
  const ok = await confirm({
    title: `Delete “${r.name}”?`,
    message: 'Visitors stop seeing it immediately. Conversations it started are kept.',
    okLabel: 'Delete',
  })
  if (!ok) return
  try {
    await del(`/v1/services/supportDesk/outbound/${r.id}`)
    toast.success('Deleted')
  } catch (e) {
    toast.error(e?.message || 'Could not delete')
  }
}
function menuFor(r) {
  return [
    { name: 'Edit', icon: IconPencil, click: () => openEdit(r) },
    ...(r.state === 'LIVE'
      ? [{ name: 'Pause', icon: IconPlayerPause, click: () => setState(r, 'PAUSED') }]
      : [{ name: 'Set live', icon: IconPlayerPlay, click: () => setState(r, 'LIVE') }]),
    { name: 'Delete', icon: IconTrash, click: () => remove(r) },
  ]
}
const STATE_CLASS = {
  LIVE: 'tw:bg-green-100 tw:text-green-700',
  PAUSED: 'tw:bg-amber-100 tw:text-amber-800',
  DRAFT: 'tw:bg-gray-100 tw:text-secondary',
}
function ruleSummary(r) {
  const parts = []
  const u = r.rules?.url
  if (u?.op && u.op !== 'any')
    parts.push(`${URL_OPS.find((o) => o.id === u.op)?.name} “${u.value}”`)
  if (r.rules?.visitorKind && r.rules.visitorKind !== 'ANY')
    parts.push(VISITOR_KINDS.find((v) => v.id === r.rules.visitorKind)?.name)
  if (r.rules?.audience && r.rules.audience !== 'ALL')
    parts.push(AUDIENCES.find((a) => a.id === r.rules.audience)?.name.split(' (')[0])
  if (r.rules?.delaySeconds) parts.push(`after ${r.rules.delaySeconds}s`)
  if (r.rules?.officeHoursOnly) parts.push('office hours')
  return parts.length ? parts.join(' · ') : 'Any page, everyone'
}
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-4">
    <div class="tw:flex tw:items-start tw:justify-between tw:gap-3">
      <div>
        <BaseText variant="overline" class="tw:block">Outbound messages</BaseText>
        <p class="tw:mt-1 tw:text-sm tw:text-secondary">
          Proactive greetings the chat widget shows on your website by rule — a reply opens a
          conversation in the inbox, attributed to the sender and routed where you choose.
        </p>
      </div>
      <BaseButton
        v-if="canManage"
        variant="primary"
        size="sm"
        :disabled="!brands.length"
        @click="openNew"
      >
        <IconPlus :size="14" class="tw:mr-1" />
        New message
      </BaseButton>
    </div>

    <BaseEmptyState
      v-if="!rows.length"
      :icon="IconSpeakerphone"
      title="No outbound messages yet"
      description="Greet visitors on a pricing page, welcome first-timers, or check in during office hours."
    />
    <ul v-else class="tw:flex tw:flex-col tw:gap-2">
      <li
        v-for="r in rows"
        :key="r.id"
        class="tw:flex tw:items-start tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:p-3"
      >
        <div class="tw:min-w-0 tw:flex-1">
          <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            <span class="tw:text-sm tw:font-semibold">{{ r.name }}</span>
            <span
              class="tw:rounded tw:px-1.5 tw:py-0.5 tw:text-micro tw:font-semibold"
              :class="STATE_CLASS[r.state]"
            >
              {{ r.state }}
            </span>
            <span v-if="brands.length > 1" class="tw:text-xs tw:text-secondary">{{
              brandName(r.brandId)
            }}</span>
          </div>
          <p class="tw:mt-1 tw:line-clamp-2 tw:text-sm tw:text-on-main">{{ r.contentText }}</p>
          <div
            class="tw:mt-1 tw:flex tw:flex-wrap tw:items-center tw:gap-x-3 tw:gap-y-1 tw:text-xs tw:text-secondary"
          >
            <span>{{ ruleSummary(r) }}</span>
            <span>·</span>
            <span>{{ SENT_AS.find((s) => s.id === r.sentAs)?.name }}</span>
            <span>·</span>
            <span
              >From <UserBadgeById v-if="r.fromUserId" :userId="r.fromUserId" /><template v-else
                >brand</template
              ></span
            >
          </div>
        </div>
        <div
          class="tw:flex tw:shrink-0 tw:items-center tw:gap-4 tw:text-center tw:text-xs tw:text-secondary"
        >
          <div>
            <div class="tw:text-sm tw:font-semibold tw:text-on-main tw:tabular-nums">
              {{ r.statsSent }}
            </div>
            sent
          </div>
          <div>
            <div class="tw:text-sm tw:font-semibold tw:text-on-main tw:tabular-nums">
              {{ r.statsOpened }}
            </div>
            opened
          </div>
          <div>
            <div class="tw:text-sm tw:font-semibold tw:text-on-main tw:tabular-nums">
              {{ r.statsReplied }}
            </div>
            replied
          </div>
          <BaseMenu v-if="canManage" :items="menuFor(r)">
            <template #trigger>
              <button
                class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover"
                aria-label="Actions"
              >
                <IconDotsVertical :size="16" />
              </button>
            </template>
          </BaseMenu>
        </div>
      </li>
    </ul>

    <!-- Editor -->
    <BaseDrawer
      v-model="editorOpen"
      size="xl"
      :title="form.id ? 'Edit outbound message' : 'New outbound message'"
    >
      <div class="tw:flex tw:flex-col tw:gap-6">
        <div class="tw:flex tw:flex-col tw:gap-4">
          <BaseTextInput
            v-model="form.name"
            label="Name (internal)"
            placeholder="Pricing page welcome"
          />
          <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <BaseField v-if="brands.length > 1" label="Brand">
              <BaseSelect
                v-model="form.brandId"
                :options="brands"
                optionLabel="name"
                optionValue="id"
                required
              />
            </BaseField>
            <BaseField label="From">
              <UserSelectMenu v-model="form.fromUserId" required />
            </BaseField>
            <BaseField label="Assign replies to">
              <UserSelectMenu
                v-model="form.assignRepliesToUserId"
                nullLabel="Auto-assign (brand rules)"
              />
            </BaseField>
          </div>

          <BaseField label="Message">
            <div class="tw:rounded-lg tw:border tw:border-divider">
              <BaseRichTextEditor
                v-model="form.contentHtml"
                placeholder="Hi there 👋 Welcome! Anything we can help with?"
              />
            </div>
          </BaseField>

          <!-- Live preview -->
          <div>
            <BaseText variant="overline" class="tw:mb-2 tw:block">Preview</BaseText>
            <div
              class="tw:relative tw:h-64 tw:rounded-xl tw:border tw:border-divider tw:bg-gradient-to-br tw:from-gray-50 tw:to-gray-100 tw:p-3"
            >
              <div
                v-if="form.sentAs !== 'BADGE'"
                class="tw:absolute tw:bottom-20 tw:right-3 tw:w-[17rem] tw:rounded-xl tw:bg-white tw:p-3 tw:text-sm tw:text-gray-900 tw:shadow-lg"
              >
                <div class="tw:flex tw:gap-2">
                  <span
                    class="tw:flex tw:h-8 tw:w-8 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-full tw:text-xs tw:font-bold tw:text-white"
                    :style="{ background: accent }"
                  >
                    {{ fromName.charAt(0).toUpperCase() }}
                  </span>
                  <div class="tw:min-w-0">
                    <div class="tw:text-xs tw:text-gray-500">{{ fromName }}</div>
                    <div
                      class="tw:whitespace-pre-wrap"
                      :class="form.sentAs === 'SNIPPET' ? 'tw:line-clamp-3' : ''"
                    >
                      {{ previewText || 'Your message appears here…' }}
                    </div>
                  </div>
                </div>
                <div class="tw:mt-2 tw:flex tw:gap-1.5">
                  <div
                    class="tw:flex-1 tw:rounded-md tw:border tw:border-gray-200 tw:px-2 tw:py-1.5 tw:text-xs tw:text-gray-400"
                  >
                    {{ form.replyType === 'EMAIL_COLLECTOR' ? 'Your email…' : 'Write a reply…' }}
                  </div>
                  <div
                    class="tw:rounded-md tw:px-2 tw:py-1.5 tw:text-xs tw:font-semibold tw:text-white"
                    :style="{ background: accent }"
                  >
                    Send
                  </div>
                </div>
              </div>
              <div
                class="tw:absolute tw:bottom-3 tw:right-3 tw:flex tw:h-12 tw:w-12 tw:items-center tw:justify-center tw:rounded-full tw:text-white tw:shadow-lg"
                :style="{ background: accent }"
              >
                <IconSpeakerphone :size="20" />
                <span
                  v-if="form.sentAs === 'BADGE'"
                  class="tw:absolute tw:-right-1 tw:-top-1 tw:rounded-full tw:bg-red-500 tw:px-1.5 tw:text-micro tw:font-bold"
                  >1</span
                >
              </div>
            </div>
            <p class="tw:mt-2 tw:text-xs tw:text-secondary">
              {{ SENT_AS.find((s) => s.id === form.sentAs)?.hint }}
            </p>
          </div>

          <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <BaseField label="Reply type">
              <BaseSelect
                v-model="form.replyType"
                :options="REPLY_TYPES"
                optionLabel="name"
                optionValue="id"
                required
              />
            </BaseField>
            <BaseField label="Sent as">
              <BaseSelect
                v-model="form.sentAs"
                :options="SENT_AS"
                optionLabel="name"
                optionValue="id"
                required
              />
            </BaseField>
          </div>

          <BaseText variant="overline" class="tw:mt-2 tw:block">Rules</BaseText>
          <div class="tw:grid tw:gap-3 tw:sm:grid-cols-[14rem_1fr]">
            <BaseSelect
              v-model="form.rules.url.op"
              :options="URL_OPS"
              optionLabel="name"
              optionValue="id"
              required
            />
            <BaseTextInput
              v-if="form.rules.url.op !== 'any'"
              v-model="form.rules.url.value"
              placeholder="https://www.example.com/pricing"
            />
          </div>
          <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <BaseField label="Audience">
              <BaseSelect
                v-model="form.rules.audience"
                :options="AUDIENCES"
                optionLabel="name"
                optionValue="id"
                required
              />
            </BaseField>
            <BaseField label="Visitor">
              <BaseSelect
                v-model="form.rules.visitorKind"
                :options="VISITOR_KINDS"
                optionLabel="name"
                optionValue="id"
                required
              />
            </BaseField>
            <BaseField label="Show after (seconds on page)">
              <BaseTextInput v-model="form.rules.delaySeconds" type="number" min="0" max="3600" />
            </BaseField>
            <BaseField label="Frequency">
              <BaseSelect
                v-model="form.frequency"
                :options="FREQUENCIES"
                optionLabel="name"
                optionValue="id"
                required
              />
            </BaseField>
          </div>
          <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm">
            <BaseCheckbox v-model="form.rules.officeHoursOnly" />
            Only during the brand's business hours
          </label>
          <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
            <BaseField label="Start sending">
              <BaseDateField v-model="form.startsAt" mode="datetime" placeholder="Immediately" />
            </BaseField>
            <BaseField label="Stop sending">
              <BaseDateField v-model="form.endsAt" mode="datetime" placeholder="Never" />
            </BaseField>
          </div>
        </div>
      </div>
      <template #footer>
        <BaseDialogFooter
          :submitLabel="form.id ? 'Save' : 'Create draft'"
          :loading="saving"
          @cancel="editorOpen = false"
          @submit="save"
        />
      </template>
    </BaseDrawer>
  </div>
</template>
