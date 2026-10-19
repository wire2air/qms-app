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

// Where the public widget is served from. The API root hosts /widget.js (not
// under /api). Deployments set VITE_WIDGET_ORIGIN (e.g. https://api.acme.com);
// locally the Vite proxy maps /api → the API, so /api/widget.js works.
const WIDGET_ORIGIN = import.meta.env.VITE_WIDGET_ORIGIN || `${window.location.origin}/api`
// The origin the test page runs on (what to add to Allowed origins to use it).
const widgetOriginHost = (() => {
  try {
    return new URL(WIDGET_ORIGIN).origin
  } catch {
    return WIDGET_ORIGIN
  }
})()
function snippetFor(b) {
  // Built from pieces: a literal "</" + "script>" inside an SFC <script> block
  // would end the block.
  return (
    `<script src="${WIDGET_ORIGIN}/widget.js" data-brand="${b.publishableKey}" async><` + `/script>`
  )
}
async function copySnippet(b) {
  try {
    await navigator.clipboard.writeText(snippetFor(b))
    toast.success('Snippet copied — paste it just before the closing body tag of your site')
  } catch {
    toast.error('Copy failed')
  }
}

// ── Install wizard: signed-in users vs anonymous visitors ─────────────────────
// Mirrors how the widget classifies people: USER (host-site user id), LEAD
// (email only), VISITOR (nothing). The "users" snippet sets
// window.qabilityChatSettings before the loader; the loader identifies the
// person as soon as the frame is ready. userHash is the identity-verification
// HMAC, computed on the customer's server with the brand secret below.
const installMode = ref('users') // users | visitors
const installFlavor = ref('basic') // basic | spa
const SC = '<' + 'script>'
const SCE = '<' + '/script>'
function loaderTag(b) {
  return `<script src="${WIDGET_ORIGIN}/widget.js" data-brand="${b.publishableKey}" async>${SCE}`
}
function usersSnippet(b) {
  const verify = form.value?.widget?.identityVerification === 'required'
  return [
    SC,
    "  // Replace the right-hand sides with the signed-in user's values.",
    '  window.qabilityChatSettings = {',
    '    userId: user.id,            // IMPORTANT: your stable user id',
    '    email: user.email,',
    '    name: user.name,',
    '    company: user.company,      // optional',
    verify
      ? '    userHash: user.chatHash,    // REQUIRED: HMAC-SHA256(identity secret, userId), computed on your server'
      : '    userHash: user.chatHash,    // recommended: HMAC-SHA256(identity secret, userId), computed on your server',
    '    attributes: { plan: user.plan, accountId: user.accountId }  // anything your agents should see',
    '  }',
    SCE,
    loaderTag(b),
  ].join('\n')
}
function visitorsSnippet(b) {
  return loaderTag(b)
}
function spaSnippet() {
  return [
    '// Single-page app: the loader is installed once; call these as state changes.',
    "qabilityChat('identify', { userId, email, name, company, userHash, attributes })  // after sign-in",
    "qabilityChat('update', { pageUrl: location.href })   // on each route change (drives outbound-message rules)",
    "qabilityChat('shutdown')                             // on sign-out: forgets the visitor on this device",
  ].join('\n')
}
const installSnippet = computed(() => {
  if (!editing.value) return 'Save the brand first to get its key.'
  if (installFlavor.value === 'spa') return spaSnippet()
  return installMode.value === 'users'
    ? usersSnippet(editing.value)
    : visitorsSnippet(editing.value)
})
async function copyInstall() {
  try {
    await navigator.clipboard.writeText(installSnippet.value)
    toast.success('Copied')
  } catch {
    toast.error('Copy failed')
  }
}
const identitySecret = ref(null)
const secretBusy = ref(false)
async function revealSecret() {
  if (!editing.value) return
  secretBusy.value = true
  try {
    const out = await get(`/v1/services/supportDesk/brands/${editing.value.id}/identitySecret`)
    identitySecret.value = out.secret
  } catch (e) {
    toast.error(e?.message || 'Could not load the secret')
  } finally {
    secretBusy.value = false
  }
}
async function rotateSecret() {
  if (!editing.value) return
  const ok = await confirm({
    title: 'Rotate the identity secret?',
    message:
      'Every hash your website currently produces stops validating the moment you rotate. Update your server with the new secret first, then rotate.',
    okLabel: 'Rotate',
  })
  if (!ok) return
  secretBusy.value = true
  try {
    const out = await post(
      `/v1/services/supportDesk/brands/${editing.value.id}/rotateIdentitySecret`,
    )
    identitySecret.value = out.secret
    toast.success('Secret rotated')
  } catch (e) {
    toast.error(e?.message || 'Could not rotate')
  } finally {
    secretBusy.value = false
  }
}
async function copySecret() {
  try {
    await navigator.clipboard.writeText(identitySecret.value || '')
    toast.success('Secret copied')
  } catch {
    toast.error('Copy failed')
  }
}
const hashExample = computed(() =>
  [
    '// Node.js (server side — never in the browser)',
    "const crypto = require('crypto')",
    "const userHash = crypto.createHmac('sha256', IDENTITY_SECRET).update(String(user.id)).digest('hex')",
    '',
    '# PHP',
    "$userHash = hash_hmac('sha256', (string) $user->id, $identitySecret);",
  ].join('\n'),
)

// Auto-messages + widget options (spec §4.4 / §5). Blank = platform default.
const AUTO_KEYS = [
  ['welcome', 'Welcome (agents online)', 'Hi! Ask us anything — an agent will reply shortly.'],
  [
    'away',
    'Away (offline / outside hours)',
    "We're currently offline. Leave your email and your message and we'll reply as soon as we're back.",
  ],
  ['waiting', 'Still waiting', 'Still here — someone will be with you in a moment.'],
  ['assigned', 'Agent joined ({agent})', "You're now chatting with {agent}."],
  ['idle', 'Visitor idle', 'Are you still there?'],
  ['ended', 'Chat ended', 'Thanks for chatting with us.'],
  ['rating', 'Rating prompt', 'How was your experience? Rate this conversation.'],
]
const WIDGET_DEFAULTS = {
  position: 'right',
  greetingTitle: 'Chat with us',
  greetingSubtitle: 'We usually reply in a few minutes.',
  requireName: false,
  requireEmail: false,
  collectEmailWhenOffline: true,
  showBusinessHours: true,
  waitingDelaySeconds: 60,
  idleMinutes: 10,
  autoEndMinutes: 30,
  ratingEnabled: true,
  transcriptEnabled: true,
  identityVerification: 'off', // off | required
}
const tab = ref('general')

const showDialog = ref(false)
const editing = ref(null)
const saving = ref(false)
const form = ref(blank())
// Declared after `editing`/`form` (setup runs top-down): forget the revealed
// secret whenever a different brand is opened.
watch(editing, () => (identitySecret.value = null))
const originsText = ref('')
function blank() {
  return {
    name: '',
    slug: '',
    fromName: '',
    fromEmail: '',
    signatureHtml: '',
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
    autoMessages: {},
    widget: { ...WIDGET_DEFAULTS },
  }
}
function openCreate() {
  tab.value = 'general'
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
    signatureHtml: b.signatureHtml || '',
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
    autoMessages: { ...(b.autoMessages || {}) },
    widget: { ...WIDGET_DEFAULTS, ...(b.widget || {}) },
  }
  tab.value = 'general'
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
    signatureHtml: form.value.signatureHtml?.trim() || null,
    fallbackEmail: form.value.fallbackEmail.trim() || null,
    unansweredAlertMinutes: Number(form.value.unansweredAlertMinutes) || 5,
    allowedOrigins: origins,
    // Only overrides are stored; blanks fall back to the platform text.
    autoMessages: Object.fromEntries(
      Object.entries(form.value.autoMessages || {}).filter(([, v]) => String(v || '').trim()),
    ),
    widget: {
      ...form.value.widget,
      waitingDelaySeconds: Number(form.value.widget.waitingDelaySeconds) || 60,
      idleMinutes: Number(form.value.widget.idleMinutes) || 10,
      autoEndMinutes: Number(form.value.widget.autoEndMinutes) || 30,
    },
  }
}
async function save() {
  if (!form.value.name.trim()) return toast.error('Name is required')
  saving.value = true
  try {
    if (editing.value) {
      await put(`/v1/services/supportDesk/brands/${editing.value.id}`, payload())
      // signature_html is not an audited field (worker lint forbids *Html
      // diffs), so a signature-only change produces no sync event — patch the
      // local record so the next open shows what was just saved.
      editing.value.signatureHtml = payload().signatureHtml
    } else await post('/v1/services/supportDesk/brands', payload())
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
            <button
              type="button"
              class="tw:ml-2 tw:font-sans tw:text-primary tw:hover:underline"
              @click="copySnippet(b)"
            >
              Copy install snippet
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
        <BaseTabs
          v-model="tab"
          :tabs="[
            { value: 'general', label: 'General' },
            { value: 'widget', label: 'Chat widget' },
            { value: 'messages', label: 'Auto-messages' },
          ]"
          ariaLabel="Brand settings"
        />
        <template v-if="tab === 'widget'">
          <!-- Install wizard -->
          <div class="tw:rounded-lg tw:border tw:border-divider tw:p-3">
            <BaseText variant="overline" class="tw:mb-2 tw:block">Install the messenger</BaseText>
            <div class="tw:grid tw:gap-2 tw:sm:grid-cols-2">
              <button
                class="tw:rounded-lg tw:border tw:p-3 tw:text-left tw:transition-colors"
                :class="
                  installMode === 'users'
                    ? 'tw:border-primary tw:bg-primary/5'
                    : 'tw:border-divider tw:hover:bg-main-hover'
                "
                @click="installMode = 'users'"
              >
                <div class="tw:flex tw:items-center tw:gap-2 tw:text-sm tw:font-semibold">
                  For users with logins
                  <span
                    class="tw:rounded tw:bg-blue-100 tw:px-1.5 tw:py-0.5 tw:text-micro tw:font-semibold tw:text-blue-800"
                    >Recommended</span
                  >
                </div>
                <p class="tw:mt-1 tw:text-xs tw:text-secondary">
                  Your app passes the signed-in user's id, email, name and any attributes. Agents
                  see who they are talking to and the person's history follows them across devices.
                </p>
              </button>
              <button
                class="tw:rounded-lg tw:border tw:p-3 tw:text-left tw:transition-colors"
                :class="
                  installMode === 'visitors'
                    ? 'tw:border-primary tw:bg-primary/5'
                    : 'tw:border-divider tw:hover:bg-main-hover'
                "
                @click="installMode = 'visitors'"
              >
                <div class="tw:text-sm tw:font-semibold">For website visitors without logins</div>
                <p class="tw:mt-1 tw:text-xs tw:text-secondary">
                  Anonymous visitors on a marketing site. They become a Lead once they leave an
                  email in the pre-chat or offline form; conversations are kept in the browser.
                </p>
              </button>
            </div>

            <div class="tw:mt-3 tw:flex tw:items-center tw:gap-1 tw:text-xs">
              <button
                class="tw:rounded-md tw:px-2 tw:py-1 tw:font-medium"
                :class="
                  installFlavor === 'basic'
                    ? 'tw:bg-main-selected'
                    : 'tw:text-secondary tw:hover:bg-main-hover'
                "
                @click="installFlavor = 'basic'"
              >
                Basic JavaScript
              </button>
              <button
                class="tw:rounded-md tw:px-2 tw:py-1 tw:font-medium"
                :class="
                  installFlavor === 'spa'
                    ? 'tw:bg-main-selected'
                    : 'tw:text-secondary tw:hover:bg-main-hover'
                "
                @click="installFlavor = 'spa'"
              >
                Single-page app
              </button>
              <span class="tw:ml-auto tw:text-secondary">
                {{
                  installFlavor === 'spa'
                    ? 'After the loader is installed once'
                    : 'Paste before the closing body tag on every page'
                }}
              </span>
            </div>
            <div class="tw:mt-2 tw:flex tw:items-start tw:gap-2">
              <pre
                class="tw:flex-1 tw:overflow-x-auto tw:rounded-md tw:border tw:border-divider tw:bg-main-hover tw:p-2 tw:text-xs tw:leading-relaxed"
                >{{ installSnippet }}</pre
              >
              <BaseButton v-if="editing" size="sm" variant="secondary" @click="copyInstall"
                >Copy</BaseButton
              >
            </div>
            <p v-if="editing" class="tw:mt-2 tw:text-xs tw:text-secondary">
              The site's origin must be listed under
              <strong>Allowed website origins</strong> (General tab). No site yet?
              <a
                :href="`${WIDGET_ORIGIN}/v1/public/chat/test?key=${editing.publishableKey}`"
                target="_blank"
                rel="noopener"
                class="tw:text-primary tw:underline"
                >Open the test page</a
              >
              (development only) — add <code>{{ widgetOriginHost }}</code> to the allowed origins
              first.
            </p>
          </div>

          <!-- Identity verification -->
          <div
            v-if="installMode === 'users'"
            class="tw:rounded-lg tw:border tw:border-divider tw:p-3"
          >
            <div class="tw:flex tw:items-start tw:justify-between tw:gap-3">
              <div>
                <BaseText variant="overline" class="tw:block">Identity verification</BaseText>
                <p class="tw:mt-1 tw:text-xs tw:text-secondary">
                  The user id arrives from the browser, so anyone could claim to be anyone. Your
                  server signs the id with this brand's secret (<code>userHash</code>); when set to
                  <em>Required</em>, an unsigned or mis-signed id is refused and the person stays
                  anonymous.
                </p>
              </div>
              <BaseSelect
                v-model="form.widget.identityVerification"
                class="tw:w-40 tw:shrink-0"
                :options="[
                  { value: 'off', label: 'Off (trust the page)' },
                  { value: 'required', label: 'Required' },
                ]"
                required
              />
            </div>
            <div v-if="editing" class="tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-2">
              <code
                v-if="identitySecret"
                class="tw:rounded-md tw:border tw:border-divider tw:bg-main-hover tw:px-2 tw:py-1 tw:text-xs tw:break-all"
                >{{ identitySecret }}</code
              >
              <BaseButton
                v-if="!identitySecret"
                size="sm"
                variant="secondary"
                :disabled="secretBusy"
                @click="revealSecret"
              >
                Reveal secret
              </BaseButton>
              <template v-else>
                <BaseButton size="sm" variant="secondary" @click="copySecret">Copy</BaseButton>
                <BaseButton size="sm" variant="outline" :disabled="secretBusy" @click="rotateSecret"
                  >Rotate</BaseButton
                >
              </template>
            </div>
            <pre
              class="tw:mt-3 tw:overflow-x-auto tw:rounded-md tw:border tw:border-divider tw:bg-main-hover tw:p-2 tw:text-xs tw:leading-relaxed"
              >{{ hashExample }}</pre
            >
          </div>

          <BaseFieldRow :columns="2">
            <BaseField label="Launcher position">
              <BaseSelect
                v-model="form.widget.position"
                :options="[
                  { value: 'right', label: 'Bottom right' },
                  { value: 'left', label: 'Bottom left' },
                ]"
              />
            </BaseField>
            <BaseField label="Greeting title"
              ><BaseTextInput v-model="form.widget.greetingTitle"
            /></BaseField>
            <BaseField label="Greeting subtitle" class="tw:md:col-span-2"
              ><BaseTextInput v-model="form.widget.greetingSubtitle"
            /></BaseField>
            <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm"
              ><BaseCheckbox v-model="form.widget.requireName" /> Ask for a name before
              chatting</label
            >
            <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm"
              ><BaseCheckbox v-model="form.widget.requireEmail" /> Require an email before
              chatting</label
            >
            <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm"
              ><BaseCheckbox v-model="form.widget.collectEmailWhenOffline" /> Require an email on
              the offline form</label
            >
            <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm"
              ><BaseCheckbox v-model="form.widget.showBusinessHours" /> Show business hours in the
              widget</label
            >
            <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm"
              ><BaseCheckbox v-model="form.widget.ratingEnabled" /> Ask for a rating when a chat
              ends</label
            >
            <label class="tw:flex tw:items-center tw:gap-2 tw:text-sm"
              ><BaseCheckbox v-model="form.widget.transcriptEnabled" /> Offer an emailed
              transcript</label
            >
            <BaseField label="“Still waiting” after (seconds)"
              ><BaseTextInput v-model="form.widget.waitingDelaySeconds" type="number" min="10"
            /></BaseField>
            <BaseField label="Idle prompt after (minutes of silence)"
              ><BaseTextInput v-model="form.widget.idleMinutes" type="number" min="1"
            /></BaseField>
            <BaseField label="Auto-end after idle (minutes)"
              ><BaseTextInput v-model="form.widget.autoEndMinutes" type="number" min="1"
            /></BaseField>
          </BaseFieldRow>
        </template>
        <template v-else-if="tab === 'messages'">
          <p class="tw:text-sm tw:text-secondary">
            What the widget says on its own. Leave a field blank to use the platform text shown as
            its placeholder. <code>{agent}</code> becomes the agent's first name.
          </p>
          <BaseField v-for="[k, label, dflt] in AUTO_KEYS" :key="k" :label="label">
            <BaseTextarea v-model="form.autoMessages[k]" :rows="2" :placeholder="dflt" />
          </BaseField>
        </template>
        <BaseFieldRow v-if="tab === 'general'" :columns="2">
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
          <BaseField
            label="Default email signature"
            class="tw:md:col-span-2"
            help="Appended to email replies sent as this brand when the agent has no signature of their own. Variables: {agent.name} {agent.firstName} {agent.email} {brand.name}"
          >
            <div class="tw:rounded-lg tw:border tw:border-divider">
              <BaseRichTextEditor
                v-model="form.signatureHtml"
                placeholder="Kind regards, {agent.name} · {brand.name} Support"
              />
            </div>
          </BaseField>
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
          v-if="tab === 'general'"
          label="Allowed website origins (one per line)"
          help="Where the chat widget may load from, e.g. https://www.acme.com"
        >
          <BaseTextarea
            v-model="originsText"
            :rows="3"
            placeholder="https://www.acme.com&#10;https://help.acme.com"
          />
        </BaseField>

        <BaseField v-if="tab === 'general'" label="Business hours">
          <SupportHoursEditor v-model="form.businessHours" />
        </BaseField>

        <BaseFieldRow v-if="tab === 'general'" :columns="2">
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
