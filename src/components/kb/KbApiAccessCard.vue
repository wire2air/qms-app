<script setup>
import { IconKey, IconPlus, IconCopy, IconTrash, IconAlertTriangle } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: a token is
// minted by the server and its secret is returned once.
import { get, post, del } from '@/api'

/**
 * API ACCESS of the knowledge base (docs/plans/knowledge-base-phase2-5.md §2–3):
 * tokens for Claude and tooling (read, write drafts, publish) and for product
 * apps that show customer articles in-app (read customer articles). A token's
 * secret is shown once; revoking it stops it at once.
 */
const props = defineProps({ kbId: { type: String, required: true } })
const toast = useToast()
const { confirm } = useConfirm()

const SCOPES = [
  { id: 'kb:read', label: 'Read every article', help: 'Drafts and agents-only included' },
  {
    id: 'kb:read_customers',
    label: 'Read customer articles',
    help: 'Published public and signed-in-customer articles, for a product app',
  },
  { id: 'kb:write', label: 'Write drafts', help: 'Create and update articles, upload files' },
  { id: 'kb:publish', label: 'Publish', help: 'Publish, unpublish and archive' },
  {
    id: 'kb:api_docs',
    label: 'API docs',
    help: 'Upload an OpenAPI file, annotate endpoints (publishing still needs Publish)',
  },
]
const PRESETS = [
  { label: 'Claude or a script', scopes: ['kb:read', 'kb:write', 'kb:publish', 'kb:api_docs'] },
  { label: 'Product app (in-app help)', scopes: ['kb:read_customers'] },
]

const clients = ref([])
const loading = ref(false)
async function load() {
  loading.value = true
  try {
    const res = await get('/v1/services/kb/api-clients')
    // Revoked tokens stay in the audit log, not in this list.
    clients.value = (res.clients || res || []).filter(
      (c) => !c.revokedAt && (!c.kbId || c.kbId === props.kbId),
    )
  } catch (e) {
    toast.error(e.message || 'Could not load the API tokens')
  } finally {
    loading.value = false
  }
}
watch(() => props.kbId, load, { immediate: true })

const form = ref(null)
function startNew(preset = PRESETS[0]) {
  form.value = { name: '', scopes: [...preset.scopes], allBases: false }
}
function toggleScope(id, on) {
  const set = new Set(form.value.scopes)
  if (on) set.add(id)
  else set.delete(id)
  form.value.scopes = [...set]
}
const creating = ref(false)
const minted = ref(null)
async function create() {
  if (!form.value.name.trim()) return toast.error('Name the token (who or what uses it)')
  if (!form.value.scopes.length) return toast.error('Pick at least one permission')
  creating.value = true
  try {
    const res = await post('/v1/services/kb/api-clients', {
      name: form.value.name.trim(),
      kbId: form.value.allBases ? null : props.kbId,
      scopes: form.value.scopes,
    })
    minted.value = { name: form.value.name.trim(), token: res.token }
    form.value = null
    await load()
  } catch (e) {
    toast.error(e.message || 'The token could not be created')
  } finally {
    creating.value = false
  }
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied')
  } catch {
    toast.error('Copy failed: select the text and copy it')
  }
}
async function revoke(c) {
  const ok = await confirm({
    title: `Revoke “${c.name}”?`,
    message: 'Anything using this token stops working at once. This cannot be undone.',
    okLabel: 'Revoke',
    danger: true,
  })
  if (!ok) return
  try {
    await del(`/v1/services/kb/api-clients/${c.id}`)
    toast.success('Token revoked')
    await load()
  } catch (e) {
    toast.error(e.message || 'The token could not be revoked')
  }
}
function when(d) {
  if (!d) return 'never'
  return typeof d === 'string' ? new Date(d).toLocaleString() : d.formatDate?.('datetime') || ''
}

const apiBase = computed(() => `${window.location.origin}/api/v1/integrations/kb`)
const mcpConfig = computed(() =>
  JSON.stringify(
    {
      mcpServers: {
        'knowledge-base': {
          type: 'http',
          url: `${apiBase.value}/mcp`,
          headers: { Authorization: 'Bearer <your token>' },
        },
      },
    },
    null,
    2,
  ),
)
const pushCommand = computed(
  () =>
    `node scripts/kb-push.mjs --api ${window.location.origin}/api --token <your token> --dir ./articles --publish`,
)
</script>

<template>
  <PageSection title="API access" :icon="IconKey" variant="card">
    <div class="tw:flex tw:flex-col tw:gap-4">
      <p class="tw:text-sm tw:text-secondary">
        Tokens let Claude, scripts and your product read and write this knowledge base. An article
        written through the API is a normal version in its history; an agent's newer edit is never
        overwritten.
      </p>

      <div
        v-if="minted"
        class="tw:flex tw:flex-col tw:gap-2 tw:rounded-md tw:border tw:border-amber-300 tw:bg-amber-50 tw:p-3"
        role="alert"
      >
        <p class="tw:flex tw:items-center tw:gap-1 tw:text-sm tw:font-medium tw:text-amber-900">
          <IconAlertTriangle :size="16" /> Copy the token for “{{ minted.name }}” now. It is not
          shown again.
        </p>
        <div class="tw:flex tw:items-center tw:gap-2">
          <code class="tw:flex-1 tw:break-all tw:rounded tw:bg-card tw:px-2 tw:py-1 tw:text-xs">{{
            minted.token
          }}</code>
          <BaseButton size="sm" variant="outline" @click="copy(minted.token)">
            <IconCopy :size="14" class="tw:mr-1" /> Copy
          </BaseButton>
          <BaseButton size="sm" variant="outline" @click="minted = null">Done</BaseButton>
        </div>
      </div>

      <ul
        v-if="clients.length"
        class="tw:divide-y tw:divide-divider tw:rounded-md tw:border tw:border-divider"
        aria-label="API tokens"
      >
        <li v-for="c in clients" :key="c.id" class="tw:flex tw:items-start tw:gap-3 tw:p-3">
          <div class="tw:min-w-0 tw:flex-1">
            <p class="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:text-sm tw:font-medium">
              {{ c.name }}
              <BaseBadge v-if="c.revokedAt" size="sm" class="tw:bg-gray-100 tw:text-gray-600"
                >Revoked</BaseBadge
              >
              <BaseBadge v-if="!c.kbId" size="sm" class="tw:bg-gray-100 tw:text-gray-700"
                >All knowledge bases</BaseBadge
              >
            </p>
            <p class="tw:mt-1 tw:flex tw:flex-wrap tw:gap-1">
              <BaseBadge
                v-for="s in c.scopes || []"
                :key="s"
                size="sm"
                class="tw:bg-sky-50 tw:text-sky-800"
                >{{ SCOPES.find((x) => x.id === s)?.label || s }}</BaseBadge
              >
            </p>
            <p class="tw:mt-1 tw:text-xs tw:text-secondary">
              kbk_{{ c.tokenPrefix }}… · last used {{ when(c.lastUsedAt) }} · created
              {{ when(c.createdAt) }}
            </p>
          </div>
          <button
            v-if="!c.revokedAt"
            type="button"
            class="tw:rounded tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-red-600"
            :aria-label="`Revoke ${c.name}`"
            @click="revoke(c)"
          >
            <IconTrash :size="16" />
          </button>
        </li>
      </ul>
      <p v-else-if="!loading && !form" class="tw:text-sm tw:text-secondary">No tokens yet.</p>

      <div
        v-if="form"
        class="tw:flex tw:flex-col tw:gap-3 tw:rounded-md tw:border tw:border-divider tw:bg-main tw:p-3"
      >
        <div class="tw:flex tw:flex-wrap tw:gap-2">
          <BaseButton
            v-for="p in PRESETS"
            :key="p.label"
            size="sm"
            variant="outline"
            @click="form.scopes = [...p.scopes]"
            >{{ p.label }}</BaseButton
          >
        </div>
        <BaseTextInput v-model="form.name" label="Name" placeholder="Claude — help articles" />
        <div class="tw:grid tw:gap-2 tw:sm:grid-cols-2">
          <div v-for="s in SCOPES" :key="s.id" class="tw:flex tw:items-start tw:gap-2">
            <BaseCheckbox
              :modelValue="form.scopes.includes(s.id)"
              :aria-label="s.label"
              @update:modelValue="(v) => toggleScope(s.id, v)"
            />
            <span class="tw:flex tw:flex-col">
              <span class="tw:text-sm">{{ s.label }}</span>
              <span class="tw:text-xs tw:text-secondary">{{ s.help }}</span>
            </span>
          </div>
        </div>
        <div class="tw:flex tw:items-center tw:gap-2">
          <BaseSwitch v-model="form.allBases" label="Every knowledge base of this company" />
          <span class="tw:text-sm">Every knowledge base of this company</span>
        </div>
        <div class="tw:flex tw:justify-end tw:gap-2">
          <BaseButton variant="outline" @click="form = null">Cancel</BaseButton>
          <BaseButton :isLoading="creating" @click="create">Create token</BaseButton>
        </div>
      </div>
      <div v-else>
        <BaseButton size="sm" variant="outline" @click="startNew()">
          <IconPlus :size="14" class="tw:mr-1" /> New token
        </BaseButton>
      </div>

      <details class="tw:rounded-md tw:border tw:border-divider tw:p-3 tw:text-sm">
        <summary class="tw:cursor-pointer tw:font-medium">Connect Claude or push a folder</summary>
        <p class="tw:mt-2 tw:text-secondary">
          Claude (MCP): add this server to Claude, with a token that can read, write and publish.
        </p>
        <pre class="tw:mt-1 tw:overflow-x-auto tw:rounded tw:bg-main tw:p-2 tw:text-xs">{{
          mcpConfig
        }}</pre>
        <p class="tw:mt-3 tw:text-secondary">
          A folder of Markdown files (each file's path is its key, so re-running updates instead of
          duplicating):
        </p>
        <pre class="tw:mt-1 tw:overflow-x-auto tw:rounded tw:bg-main tw:p-2 tw:text-xs">{{
          pushCommand
        }}</pre>
        <p class="tw:mt-3 tw:text-secondary">API: {{ apiBase }}</p>
      </details>
    </div>
  </PageSection>
</template>
