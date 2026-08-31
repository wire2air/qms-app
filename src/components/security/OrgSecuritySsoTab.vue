<script setup>
/**
 * Single sign-on — tenant self-service configuration.
 *
 * Two halves, in the order the work actually happens:
 *   1. OUR details, to paste into the IdP (entity id, ACS URL, metadata link).
 *   2. THEIR details, easiest by pasting the IdP's metadata document — Okta,
 *      Entra and Google all publish the same standard XML, so the three
 *      error-prone values (entity id, sign-on URL, signing certificate) are
 *      extracted rather than transcribed. What we extracted is shown for
 *      confirmation before anything is saved.
 *
 * A connection starts as a draft and is activated deliberately; the server
 * refuses to activate one that is missing what its protocol needs, so the
 * failure lands here rather than on an end user staring at a broken button.
 */
// Action RPCs (not entity CRUD) — see CLAUDE.md rule #4 exception.
import { get, post, patch, del } from '@/api'
import { IconCopy, IconPlus, IconTrash, IconFileImport } from '@tabler/icons-vue'

const toast = useToast()

const sp = ref(null)
// The tenant master switch. Connections carry their own status, but sign-in
// also checks this — without it here an admin configures a connection, sees it
// ACTIVE, and still gets bounced with "SSO is disabled".
const ssoEnabled = ref(false)
const connections = ref([])
const loading = ref(false)
const saving = ref(false)

const editing = ref(null) // the connection being created/edited
const metadataXml = ref('')
const parsing = ref(false)

const BLANK = {
  protocol: 'SAML',
  displayName: '',
  idpEntityId: '',
  idpSsoUrl: '',
  idpSloUrl: '',
  idpCertificates: [],
  emailDomains: [],
  enforced: false,
  allowIdpInitiated: false,
}

async function load() {
  loading.value = true
  try {
    const [spData, list, settings] = await Promise.all([
      get('/v1/admin/security/sso/sp', { showError: false }),
      get('/v1/admin/security/sso/connections', { showError: false }),
      get('/v1/admin/security/settings', { showError: false }),
    ])
    sp.value = spData?.sp ?? null
    connections.value = list?.connections ?? []
    ssoEnabled.value = !!settings?.settings?.ssoEnabled
  } catch (e) {
    toast.error(e?.message || 'Could not load SSO configuration')
  } finally {
    loading.value = false
  }
}
onMounted(load)

function startNew() {
  editing.value = { ...BLANK }
  metadataXml.value = ''
}
function startEdit(c) {
  editing.value = { ...c, emailDomains: [...(c.emailDomains ?? [])] }
  metadataXml.value = ''
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied')
  } catch {
    toast.error('Could not copy — select the text instead')
  }
}

/** Paste the IdP's metadata; we extract, the admin confirms, nothing is saved. */
async function parseMetadata() {
  if (!metadataXml.value.trim()) return
  parsing.value = true
  try {
    const data = await post('/v1/admin/security/sso/parse-metadata', { xml: metadataXml.value })
    Object.assign(editing.value, data.parsed)
    toast.success(
      `Read the metadata: ${data.parsed.idpCertificates.length} signing certificate${
        data.parsed.idpCertificates.length === 1 ? '' : 's'
      } found. Check the values, then save.`,
    )
  } catch (e) {
    toast.error(e?.message || 'Could not read that metadata')
  } finally {
    parsing.value = false
  }
}

async function save({ activate = false } = {}) {
  if (saving.value) return
  saving.value = true
  try {
    const body = { ...editing.value }
    if (activate) body.status = 'ACTIVE'
    const saved = editing.value.id
      ? await patch(`/v1/admin/security/sso/connections/${editing.value.id}`, body)
      : await post('/v1/admin/security/sso/connections', body)
    toast.success(activate ? 'Connection activated' : 'Saved')
    editing.value = null
    await load()
    return saved
  } catch (e) {
    // The server refuses to activate an incomplete connection — that message
    // is the useful one, so pass it straight through.
    toast.error(e?.message || 'Could not save the connection')
  } finally {
    saving.value = false
  }
}

async function toggleSso(value) {
  ssoEnabled.value = value
  try {
    await patch('/v1/admin/security/settings', { ssoEnabled: value })
    toast.success(value ? 'Single sign-on enabled' : 'Single sign-on disabled')
  } catch (e) {
    ssoEnabled.value = !value
    toast.error(e?.message || 'Could not change the setting')
  }
}

async function remove(c) {
  try {
    await del(`/v1/admin/security/sso/connections/${c.id}`)
    toast.success('Connection removed')
    await load()
  } catch (e) {
    toast.error(e?.message || 'Could not remove the connection')
  }
}

async function setStatus(c, status) {
  try {
    await patch(`/v1/admin/security/sso/connections/${c.id}`, { status })
    await load()
  } catch (e) {
    toast.error(e?.message || 'Could not change the status')
  }
}

const domainsText = computed({
  get: () => (editing.value?.emailDomains ?? []).join(', '),
  set: (v) => {
    editing.value.emailDomains = String(v)
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)
  },
})
const certsText = computed({
  get: () => (editing.value?.idpCertificates ?? []).join('\n\n'),
  set: (v) => {
    editing.value.idpCertificates = String(v)
      .split(/\n\s*\n/)
      .map((c) => c.trim())
      .filter(Boolean)
  },
})
</script>

<template>
  <div class="tw:flex tw:flex-col tw:gap-5">
    <p class="tw:text-sm tw:text-secondary">
      Let people sign in with your own identity provider — Microsoft Entra ID, Okta or Google
      Workspace. Give your IdP the details below, then add a connection using the metadata your
      IdP publishes.
    </p>

    <label class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:p-3">
      <BaseSwitch :modelValue="ssoEnabled" @update:modelValue="toggleSso" />
      <span class="tw:text-sm tw:text-on-main">
        Enable single sign-on for this workspace
        <span class="tw:block tw:text-xs tw:text-secondary">
          The master switch. Turn it off to stop all SSO at once — for example while a
          misconfigured provider is being fixed — without deleting anything.
        </span>
      </span>
    </label>

    <!-- 1. Our half — what the customer types into their IdP. -->
    <div v-if="sp" class="tw:rounded-lg tw:border tw:border-divider tw:p-4 tw:flex tw:flex-col tw:gap-3">
      <BaseText variant="overline" class="tw:block">Give these to your identity provider</BaseText>
      <div
        v-for="row in [
          { label: 'Audience / Entity ID', value: sp.entityId },
          { label: 'Sign-on URL (ACS)', value: sp.acsUrl },
          { label: 'Our metadata', value: sp.metadataUrl },
        ]"
        :key="row.label"
        class="tw:flex tw:items-center tw:gap-2"
      >
        <span class="tw:w-48 tw:shrink-0 tw:text-xs tw:font-medium tw:text-secondary">
          {{ row.label }}
        </span>
        <code class="tw:flex-1 tw:min-w-0 tw:truncate tw:rounded tw:bg-main-hover tw:px-2 tw:py-1 tw:text-xs">
          {{ row.value }}
        </code>
        <button
          type="button"
          class="tw:rounded tw:p-1 tw:text-secondary tw:hover:text-primary"
          :aria-label="`Copy ${row.label}`"
          @click="copy(row.value)"
        >
          <IconCopy :size="15" />
        </button>
      </div>
    </div>

    <!-- 2. The connections themselves. -->
    <div class="tw:flex tw:items-center tw:justify-between">
      <BaseText variant="overline" class="tw:block">Connections</BaseText>
      <BaseButton v-if="!editing" size="sm" variant="outline" @click="startNew">
        <template #icon><IconPlus :size="15" /></template>
        Add connection
      </BaseButton>
    </div>

    <p v-if="loading" class="tw:text-sm tw:text-secondary">Loading…</p>
    <p v-else-if="!connections.length && !editing" class="tw:text-sm tw:text-secondary tw:italic">
      No connections yet.
    </p>

    <div
      v-for="c in connections"
      :key="c.id"
      class="tw:flex tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-divider tw:p-3"
    >
      <div class="tw:min-w-0 tw:flex-1">
        <div class="tw:flex tw:items-center tw:gap-2">
          <span class="tw:text-sm tw:font-medium tw:text-on-main">{{ c.displayName }}</span>
          <BaseBadge class="tw:text-micro">{{ c.protocol }}</BaseBadge>
          <BaseBadge
            class="tw:text-micro"
            :class="c.status === 'ACTIVE' ? 'tw:bg-green-100 tw:text-green-700' : 'tw:bg-gray-100 tw:text-gray-600'"
          >
            {{ c.status }}
          </BaseBadge>
          <BaseBadge v-if="c.enforced" class="tw:text-micro tw:bg-amber-100 tw:text-amber-800">
            Required
          </BaseBadge>
        </div>
        <p class="tw:text-xs tw:text-secondary tw:truncate">
          {{ c.emailDomains?.join(', ') || 'No domains — pick this connection by name' }}
        </p>
      </div>
      <BaseButton size="sm" variant="outline" @click="startEdit(c)">Edit</BaseButton>
      <BaseButton
        size="sm"
        variant="outline"
        @click="setStatus(c, c.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE')"
      >
        {{ c.status === 'ACTIVE' ? 'Disable' : 'Activate' }}
      </BaseButton>
      <button
        type="button"
        class="tw:rounded tw:p-1 tw:text-secondary tw:hover:text-bad"
        aria-label="Remove connection"
        @click="remove(c)"
      >
        <IconTrash :size="16" />
      </button>
    </div>

    <!-- 3. The editor. -->
    <div v-if="editing" class="tw:rounded-lg tw:border tw:border-primary/30 tw:p-4 tw:flex tw:flex-col tw:gap-3">
      <BaseText variant="overline" class="tw:block">
        {{ editing.id ? 'Edit connection' : 'New connection' }}
      </BaseText>

      <BaseField label="Name">
        <BaseTextInput v-model="editing.displayName" placeholder="e.g. Acme Okta" />
      </BaseField>

      <!-- The fast path: paste what the IdP publishes. -->
      <BaseField label="Paste your IdP's metadata XML (fastest)">
        <BaseTextarea
          v-model="metadataXml"
          rows="4"
          placeholder="Paste the metadata document from Okta / Entra / Google here…"
        />
      </BaseField>
      <div>
        <BaseButton size="sm" variant="outline" :disabled="parsing || !metadataXml.trim()" @click="parseMetadata">
          <template #icon><IconFileImport :size="15" /></template>
          {{ parsing ? 'Reading…' : 'Read metadata' }}
        </BaseButton>
      </div>

      <BaseField label="IdP Entity ID">
        <BaseTextInput v-model="editing.idpEntityId" placeholder="http://www.okta.com/exk…" />
      </BaseField>
      <BaseField label="IdP sign-on URL">
        <BaseTextInput v-model="editing.idpSsoUrl" placeholder="https://acme.okta.com/app/…/sso/saml" />
      </BaseField>
      <BaseField label="Signing certificate(s) — blank line between each">
        <BaseTextarea v-model="certsText" rows="4" placeholder="MIIDp…" />
      </BaseField>
      <BaseField label="Email domains (comma separated)">
        <BaseTextInput v-model="domainsText" placeholder="acme.com, acme.co.uk" />
      </BaseField>

      <label class="tw:flex tw:items-center tw:gap-3">
        <BaseSwitch v-model="editing.enforced" />
        <span class="tw:text-sm tw:text-on-main">
          Require SSO — people in these domains can no longer sign in with a password
        </span>
      </label>

      <div class="tw:flex tw:justify-end tw:gap-2 tw:border-t tw:border-divider tw:pt-3">
        <BaseButton variant="outline" :disabled="saving" @click="editing = null">Cancel</BaseButton>
        <BaseButton variant="outline" :disabled="saving" @click="save()">Save as draft</BaseButton>
        <BaseButton variant="primary" :disabled="saving" @click="save({ activate: true })">
          {{ saving ? 'Saving…' : 'Save & activate' }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
