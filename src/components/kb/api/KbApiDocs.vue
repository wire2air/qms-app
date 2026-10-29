<script setup>
import {
  IconArrowLeft,
  IconApi,
  IconExternalLink,
  IconUpload,
  IconDownload,
  IconFileCode,
  IconArrowUp,
  IconArrowDown,
  IconPencil,
  IconTrash,
  IconNotes,
  IconEye,
  IconEyeOff,
  IconFolders,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: the API
// portal, its groups, operations and imports are read and written through
// /v1/services/kb (staging, diffing, hashing and ordering are the server's).
import { get, post, put, del, upload } from '@/api'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useUnsavedChangesGuard } from '@shared/composables/useUnsavedChangesGuard.js'

/**
 * THE API DOCUMENTATION PORTAL OF A KNOWLEDGE BASE (docs/plans/api-docs-portal.md):
 * the admin uploads an OpenAPI/Swagger file, reviews what it would change
 * (KbApiImportReview), applies it, then chooses which endpoints are published,
 * writes the words around them (KbApiOperationEditor), shapes the groups and
 * the portal itself. The help center renders it at <help host>/api-help.
 *
 * Endpoints: the operations list, grouped. Groups: the spec's tags, renamed and
 * ordered. Settings: the portal's title, intro, auth notes, base URL, samples,
 * published. History: every upload, with its review and file.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { confirm } = useConfirm()
const canRead = computed(() => isAllowed(['knowledge_base:read']))
const canUpdate = computed(() => isAllowed(['knowledge_base:update']))
const canPublish = computed(() => isAllowed(['knowledge_base:publish']))
const canManage = computed(() => isAllowed(['knowledge_base:manage_settings']))

const bases = useLiveQuery((db) => db.KbKnowledgeBase.where().exec(), {
  models: ['KbKnowledgeBase'],
  initial: [],
})
const baseOptions = computed(() =>
  [...bases.value]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((k) => ({ value: k.id, label: k.name })),
)
const kbId = computed({
  get: () =>
    bases.value.some((k) => k.id === route.query.kb)
      ? route.query.kb
      : (baseOptions.value[0]?.value ?? null),
  set: (v) => router.replace({ query: { ...route.query, kb: v || undefined } }),
})
const kb = computed(() => bases.value.find((k) => k.id === kbId.value) || null)
const KB = computed(() => `/v1/services/kb/bases/${kbId.value}/api-portal`)

// ── Load ─────────────────────────────────────────────────────────────────────
const portal = ref(null)
const loaded = ref(false)
const groups = ref([])
const operations = ref([])
const imports = ref([])
const address = ref(null)
async function loadPortal() {
  const res = await get(KB.value)
  portal.value = res.portal
  if (!settingsDirty.value) loadSettings(res.portal)
}
async function loadGroups() {
  if (!portal.value) return (groups.value = [])
  const res = await get(`${KB.value}/groups`)
  groups.value = res.groups || []
}
async function loadOperations() {
  if (!portal.value) return (operations.value = [])
  const res = await get(`${KB.value}/operations`)
  operations.value = res.operations || []
}
async function loadImports() {
  if (!portal.value) return (imports.value = [])
  const res = await get(`${KB.value}/imports`)
  imports.value = res.imports || []
}
async function loadAddress() {
  try {
    address.value = await get(`/v1/services/kb/bases/${kbId.value}/site`)
  } catch {
    address.value = null
  }
}
async function loadAll() {
  if (!kbId.value) return
  try {
    await loadPortal()
    await Promise.all([loadGroups(), loadOperations(), loadImports()])
  } catch (e) {
    toast.error(e.message || 'The API docs could not be loaded')
  } finally {
    loaded.value = true
  }
}
watch(
  kbId,
  (id, old) => {
    if (!id || id === old) return
    loaded.value = false
    portal.value = null
    loadAll()
    loadAddress()
  },
  { immediate: true },
)

const portalUrl = computed(() =>
  address.value?.url ? `${address.value.url.replace(/\/$/, '')}/api-help` : null,
)
const hasOperations = computed(() => operations.value.length > 0)

// ── Tabs ─────────────────────────────────────────────────────────────────────
const tab = ref('endpoints')
const tabs = computed(() => [
  { value: 'endpoints', label: 'Endpoints', badge: operations.value.length || undefined },
  { value: 'groups', label: 'Groups', badge: groups.value.length || undefined },
  { value: 'settings', label: 'Settings' },
  { value: 'history', label: 'History', badge: imports.value.length || undefined },
])

// ── Upload + review ──────────────────────────────────────────────────────────
const fileInput = ref(null)
const uploading = ref(false)
const reviewId = ref(null)
const reviewOpen = ref(false)
function openReview(id) {
  reviewId.value = id
  reviewOpen.value = true
}
async function onFilePicked(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file || !kbId.value) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await upload(`${KB.value}/imports`, fd)
    await loadAll()
    openReview(res.import.id)
  } catch (err) {
    toast.error(err.message || 'The file could not be read')
  } finally {
    uploading.value = false
  }
}

// ── Downloads ────────────────────────────────────────────────────────────────
async function downloadFile(url, filename) {
  try {
    const res = await get(url, { responseType: 'blob', raw: true })
    const href = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  } catch (e) {
    toast.error(e.message || 'The file could not be downloaded')
  }
}
function downloadOpenApi() {
  downloadFile(`${KB.value}/openapi.json`, `${kb.value?.slug || 'api'}-openapi.json`)
}

// ── Endpoints ────────────────────────────────────────────────────────────────
const filters = ref({ search: '', state: 'ALL', published: 'ALL', groupId: null })
const STATE_OPTIONS = [
  { value: 'ALL', label: 'Active and removed' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'REMOVED', label: 'Removed' },
]
const PUBLISHED_OPTIONS = [
  { value: 'ALL', label: 'Published or not' },
  { value: 'YES', label: 'Published' },
  { value: 'NO', label: 'Not published' },
]
const groupOptions = computed(() => groups.value.map((g) => ({ value: g.id, label: g.title })))
const filteredOps = computed(() => {
  const f = filters.value
  const q = f.search.trim().toLowerCase()
  return operations.value.filter((o) => {
    if (f.state !== 'ALL' && o.state !== f.state) return false
    if (f.published === 'YES' && !o.published) return false
    if (f.published === 'NO' && o.published) return false
    if (f.groupId && o.groupId !== f.groupId) return false
    if (!q) return true
    return [o.path, o.title, o.specSummary, o.key].some((v) =>
      String(v || '')
        .toLowerCase()
        .includes(q),
    )
  })
})
function byPosition(a, b) {
  return (a.position ?? 0) - (b.position ?? 0) || String(a.path).localeCompare(String(b.path))
}
// Group headers in group order, the ungrouped last; rows in their position.
const groupedOps = computed(() => {
  const sections = [...groups.value]
    .sort(byPosition)
    .map((g) => ({ id: g.id, title: g.title, rows: [] }))
  const none = { id: null, title: 'No group', rows: [] }
  const byId = new Map(sections.map((s) => [s.id, s]))
  for (const o of filteredOps.value) (byId.get(o.groupId) || none).rows.push(o)
  for (const s of sections) s.rows.sort(byPosition)
  none.rows.sort(byPosition)
  return [...sections, none].filter((s) => s.rows.length)
})
const editorId = ref(null)
const editorOpen = ref(false)
function openOperation(o) {
  editorId.value = o.id
  editorOpen.value = true
}
const busyOp = ref(null)
async function setPublished(o, published) {
  busyOp.value = o.id
  try {
    const res = await put(`/v1/services/kb/api-operations/${o.id}`, { published })
    Object.assign(o, res.operation)
    await loadPortal()
  } catch (e) {
    toast.error(e.message || 'Could not change the published state')
  } finally {
    busyOp.value = null
  }
}
async function deleteOperation(o) {
  const ok = await confirm({
    title: 'Delete this endpoint?',
    message:
      'Its definition and notes are removed. It comes back as New if a later upload still has it.',
    okLabel: 'Delete',
    danger: true,
  })
  if (!ok) return
  busyOp.value = o.id
  try {
    await del(`/v1/services/kb/api-operations/${o.id}`)
    await loadAll()
  } catch (e) {
    toast.error(e.message || 'The endpoint could not be deleted')
  } finally {
    busyOp.value = null
  }
}
// Move within its group: the server takes the group's whole order.
function siblingsOf(o) {
  return operations.value.filter((x) => x.groupId === o.groupId).sort(byPosition)
}
async function moveOperation(o, dir) {
  const list = siblingsOf(o)
  const i = list.findIndex((x) => x.id === o.id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  busyOp.value = o.id
  try {
    await post(`${KB.value}/operations/reorder`, { groupId: o.groupId, ids: list.map((x) => x.id) })
    await loadOperations()
  } catch (e) {
    toast.error(e.message || 'Could not reorder')
  } finally {
    busyOp.value = null
  }
}
function opMenu(o, section) {
  const i = section.rows.findIndex((x) => x.id === o.id)
  return [
    {
      name: o.published ? 'Unpublish' : 'Publish',
      icon: o.published ? IconEyeOff : IconEye,
      click: () => setPublished(o, !o.published),
      disabled: !canPublish.value || o.state === 'REMOVED',
    },
    { name: 'Edit', icon: IconPencil, click: () => openOperation(o) },
    {
      name: 'Move up',
      icon: IconArrowUp,
      click: () => moveOperation(o, -1),
      disabled: !canUpdate.value || i <= 0,
    },
    {
      name: 'Move down',
      icon: IconArrowDown,
      click: () => moveOperation(o, 1),
      disabled: !canUpdate.value || i >= section.rows.length - 1,
    },
    {
      name: 'Delete',
      icon: IconTrash,
      click: () => deleteOperation(o),
      disabled: !canManage.value,
    },
  ]
}

// ── Groups ───────────────────────────────────────────────────────────────────
const sortedGroups = computed(() => [...groups.value].sort(byPosition))
const groupDraft = ref(null)
const groupOpen = ref(false)
const savingGroup = ref(false)
function editGroup(g) {
  groupDraft.value = { id: g.id, title: g.title, slug: g.slug, introMd: g.introMd || '' }
  groupOpen.value = true
}
async function saveGroup() {
  const d = groupDraft.value
  if (!d) return
  savingGroup.value = true
  try {
    await put(`/v1/services/kb/api-groups/${d.id}`, {
      title: d.title.trim(),
      slug: d.slug.trim(),
      introMd: d.introMd,
    })
    groupOpen.value = false
    toast.success('Group saved')
    await loadGroups()
  } catch (e) {
    toast.error(e.message || 'The group could not be saved')
  } finally {
    savingGroup.value = false
  }
}
async function setGroupPublished(g, published) {
  try {
    const res = await put(`/v1/services/kb/api-groups/${g.id}`, { published })
    Object.assign(g, res.group)
  } catch (e) {
    toast.error(e.message || 'Could not change the published state')
  }
}
async function moveGroup(g, dir) {
  const list = [...sortedGroups.value]
  const i = list.findIndex((x) => x.id === g.id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  try {
    await post(`${KB.value}/groups/reorder`, { ids: list.map((x) => x.id) })
    await loadGroups()
  } catch (e) {
    toast.error(e.message || 'Could not reorder')
  }
}

// ── Settings ─────────────────────────────────────────────────────────────────
const LANGUAGES = [
  { id: 'curl', label: 'curl' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
]
const settings = ref(null)
const settingsBase = ref('')
function loadSettings(p) {
  const s = p?.settings || {}
  settings.value = {
    title: p?.title || '',
    baseUrl: p?.baseUrl || '',
    introMd: p?.introMd || '',
    authNotesMd: p?.authNotesMd || '',
    published: !!p?.published,
    sampleLanguages: [...(s.sampleLanguages || ['curl', 'javascript', 'python'])],
    keyPlaceholder: s.keyPlaceholder || '',
    showTryIt: !!s.showTryIt,
  }
  settingsBase.value = JSON.stringify(settings.value)
}
const settingsDirty = computed(
  () => !!settings.value && JSON.stringify(settings.value) !== settingsBase.value,
)
const { allowLeave } = useUnsavedChangesGuard(settingsDirty)
function hasLanguage(id) {
  return settings.value?.sampleLanguages.includes(id)
}
function setLanguage(id, on) {
  const set = new Set(settings.value.sampleLanguages)
  if (on) set.add(id)
  else set.delete(id)
  settings.value.sampleLanguages = LANGUAGES.map((l) => l.id).filter((x) => set.has(x))
}
const savingSettings = ref(false)
async function saveSettings() {
  const s = settings.value
  if (!s || !kbId.value) return
  const before = JSON.parse(settingsBase.value)
  const body = {}
  for (const k of ['title', 'introMd', 'authNotesMd']) if (s[k] !== before[k]) body[k] = s[k]
  if (s.baseUrl !== before.baseUrl) body.baseUrl = s.baseUrl.trim() || null
  if (s.published !== before.published && canPublish.value) body.published = s.published
  if (
    JSON.stringify(s.sampleLanguages) !== JSON.stringify(before.sampleLanguages) ||
    s.keyPlaceholder !== before.keyPlaceholder ||
    s.showTryIt !== before.showTryIt
  ) {
    body.settings = {
      sampleLanguages: s.sampleLanguages,
      keyPlaceholder: s.keyPlaceholder.trim() || null,
      showTryIt: s.showTryIt,
    }
  }
  savingSettings.value = true
  try {
    const res = await put(KB.value, body)
    portal.value = res.portal
    loadSettings(res.portal)
    toast.success('API docs saved')
    if (!groups.value.length && !operations.value.length) loadAll()
  } catch (e) {
    toast.error(e.message || 'The settings could not be saved')
  } finally {
    savingSettings.value = false
  }
}

// ── History ──────────────────────────────────────────────────────────────────
const IMPORT_STATUS = {
  STAGED: { label: 'Waiting for review', class: 'tw:bg-amber-100 tw:text-amber-800' },
  APPLIED: { label: 'Current', class: 'tw:bg-green-100 tw:text-green-700' },
  SUPERSEDED: { label: 'Superseded', class: 'tw:bg-gray-100 tw:text-gray-600' },
  DISCARDED: { label: 'Discarded', class: 'tw:bg-gray-100 tw:text-gray-600' },
}
const SOURCE_LABEL = { UPLOAD: 'Upload', API: 'API', MCP: 'Claude (MCP)' }
const importColumns = [
  { name: 'createdAt', label: 'When', field: 'createdAt' },
  { name: 'createdBy', label: 'By', field: 'createdBy' },
  { name: 'source', label: 'Source', field: (r) => SOURCE_LABEL[r.source] || r.source },
  { name: 'format', label: 'Format', field: (r) => r.info?.fileFormat || r.format },
  { name: 'filename', label: 'File', field: 'filename' },
  { name: 'status', label: 'Status', field: 'status' },
  { name: 'summary', label: 'Summary', field: 'summary' },
  { name: 'actions', label: '', field: 'id', align: 'right' },
]
const sortedImports = computed(() =>
  [...imports.value].sort((a, b) => (String(b.createdAt) < String(a.createdAt) ? -1 : 1)),
)
// createdBy is a user id for desk uploads; an API or MCP push may name its token.
function isUuid(v) {
  return /^[0-9a-f-]{36}$/i.test(String(v || ''))
}
function when(d) {
  if (!d) return ''
  return typeof d === 'string' ? new Date(d).toLocaleString() : d.formatDate?.('datetime') || ''
}
function summaryOf(s) {
  if (!s) return ''
  return `${s.added ?? 0} new · ${s.changed ?? 0} changed · ${s.removed ?? 0} removed`
}

function back() {
  allowLeave()
  router.push(getCompanyPath(`/desk/kb${kbId.value ? `?kb=${kbId.value}` : ''}`))
}
</script>

<template>
  <div
    class="tw:flex tw:h-screen tw:w-full tw:flex-col tw:overflow-hidden tw:bg-main tw:text-on-main"
  >
    <header
      class="tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:border-b tw:border-divider tw:bg-card tw:px-4 tw:py-2"
    >
      <button
        class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main"
        aria-label="Back to the knowledge base"
        @click="back"
      >
        <IconArrowLeft :size="18" />
      </button>
      <IconApi :size="18" class="tw:text-primary" />
      <BaseHeading :level="1" class="tw:text-sm tw:font-semibold">API docs</BaseHeading>
      <div v-if="baseOptions.length > 1" class="tw:w-56">
        <BaseSelect v-model="kbId" :options="baseOptions" required aria-label="Knowledge base" />
      </div>
      <span v-else-if="kb" class="tw:text-sm tw:text-secondary">{{ kb.name }}</span>
      <BaseBadge
        v-if="loaded"
        size="sm"
        :class="
          portal?.published
            ? 'tw:bg-green-100 tw:text-green-700'
            : 'tw:bg-gray-100 tw:text-gray-600'
        "
      >
        {{ portal?.published ? 'Published' : 'Not published' }}
      </BaseBadge>
      <div class="tw:flex-1" />
      <a
        v-if="portal?.published && portalUrl"
        :href="portalUrl"
        target="_blank"
        rel="noopener"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-sm tw:text-primary tw:hover:underline"
      >
        Open portal <IconExternalLink :size="14" />
      </a>
      <BaseButton
        v-if="portal && portal.counts?.published"
        variant="outline"
        size="sm"
        @click="downloadOpenApi"
      >
        <IconDownload :size="16" class="tw:mr-1" /> Download OpenAPI
      </BaseButton>
      <BaseButton v-if="canManage && kb" :isLoading="uploading" @click="fileInput?.click()">
        <IconUpload :size="16" class="tw:mr-1" /> Upload spec
      </BaseButton>
      <input
        ref="fileInput"
        type="file"
        accept=".json,.yaml,.yml,application/json,application/yaml"
        class="tw:hidden"
        @change="onFilePicked"
      />
    </header>

    <BaseEmptyState
      v-if="!canRead"
      class="tw:mt-16"
      title="API docs are for knowledge base users"
      description="Ask someone with a Support role for access to the knowledge base."
    />
    <div v-else-if="!kb || !loaded" class="tw:flex tw:flex-1 tw:items-center tw:justify-center">
      <BaseSpinner v-if="!loaded && kb" />
      <BaseEmptyState
        v-else
        :icon="IconApi"
        title="No knowledge base yet"
        description="Each support brand gets a knowledge base. Add a brand in Desk settings first."
      />
    </div>
    <div v-else class="tw:min-h-0 tw:flex-1 tw:overflow-y-auto">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-6">
        <BaseBanner
          v-if="portal?.stagedImport"
          tone="warning"
          :icon="IconFileCode"
          title="A file is waiting for review"
          :message="`${portal.stagedImport.filename} — ${summaryOf(portal.stagedImport.summary)}. Nothing changes until it is applied.`"
        >
          <template #actions>
            <BaseButton size="sm" @click="openReview(portal.stagedImport.id)">Review</BaseButton>
          </template>
        </BaseBanner>

        <BaseTabs v-model="tab" :tabs="tabs" ariaLabel="API docs sections">
          <div class="tw:mt-4">
            <!-- Endpoints -->
            <BaseTabPanel value="endpoints">
              <BaseEmptyState
                v-if="!hasOperations"
                :icon="IconApi"
                title="No endpoints yet"
                description="Upload an OpenAPI 3 or Swagger 2 file (JSON or YAML). You review every endpoint it brings before anything is published."
              >
                <template v-if="canManage" #action>
                  <BaseButton :isLoading="uploading" @click="fileInput?.click()">
                    <IconUpload :size="16" class="tw:mr-1" /> Upload spec
                  </BaseButton>
                </template>
              </BaseEmptyState>
              <div v-else class="tw:flex tw:flex-col tw:gap-3">
                <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                  <BaseTextInput
                    v-model="filters.search"
                    placeholder="Search path, title or key"
                    class="tw:w-64"
                    aria-label="Search endpoints"
                  />
                  <div class="tw:w-44">
                    <BaseSelect
                      v-model="filters.state"
                      :options="STATE_OPTIONS"
                      required
                      :searchable="false"
                      aria-label="State"
                    />
                  </div>
                  <div class="tw:w-44">
                    <BaseSelect
                      v-model="filters.published"
                      :options="PUBLISHED_OPTIONS"
                      required
                      :searchable="false"
                      aria-label="Published"
                    />
                  </div>
                  <div class="tw:w-48">
                    <BaseSelect
                      v-model="filters.groupId"
                      :options="groupOptions"
                      nullLabel="All groups"
                      clearable
                      aria-label="Group"
                    />
                  </div>
                  <span class="tw:text-xs tw:text-secondary">
                    {{ portal.counts?.published ?? 0 }} of
                    {{ portal.counts?.active ?? 0 }} published
                  </span>
                </div>

                <p
                  v-if="!groupedOps.length"
                  class="tw:rounded-md tw:border tw:border-divider tw:p-6 tw:text-center tw:text-sm tw:text-secondary"
                >
                  No endpoint matches.
                </p>
                <div
                  v-for="s in groupedOps"
                  :key="s.id || 'none'"
                  class="tw:overflow-hidden tw:rounded-md tw:border tw:border-divider tw:bg-card"
                >
                  <p
                    class="tw:border-b tw:border-divider tw:bg-main tw:px-3 tw:py-1.5 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
                  >
                    {{ s.title }}
                    <span class="tw:font-normal tw:normal-case">· {{ s.rows.length }}</span>
                  </p>
                  <BaseClickableRow
                    v-for="o in s.rows"
                    :key="o.id"
                    :aria-label="`${o.method} ${o.path}`"
                    class="tw:flex tw:items-center tw:gap-3 tw:border-b tw:border-divider tw:px-3 tw:py-2 tw:text-sm tw:last:border-b-0 tw:hover:bg-main-hover"
                    :class="o.state === 'REMOVED' && 'tw:opacity-70'"
                    @click="openOperation(o)"
                  >
                    <KbApiMethodBadge :method="o.method" />
                    <div class="tw:min-w-0 tw:flex-1">
                      <p class="tw:truncate tw:text-xs">
                        <code>{{ o.path }}</code>
                      </p>
                      <p class="tw:truncate tw:text-xs tw:text-secondary">
                        {{ o.title || o.specSummary || o.key }}
                      </p>
                    </div>
                    <div
                      class="tw:flex tw:shrink-0 tw:flex-wrap tw:items-center tw:justify-end tw:gap-1"
                    >
                      <IconNotes
                        v-if="o.hasNotes"
                        :size="14"
                        class="tw:text-secondary"
                        aria-label="Has notes"
                      />
                      <BaseBadge
                        v-if="o.state === 'REMOVED'"
                        size="sm"
                        class="tw:bg-gray-200 tw:text-gray-700"
                        >Removed</BaseBadge
                      >
                      <BaseBadge
                        v-if="o.deprecated"
                        size="sm"
                        class="tw:bg-amber-100 tw:text-amber-800"
                        >Deprecated</BaseBadge
                      >
                      <BaseBadge
                        v-if="o.audience === 'CUSTOMERS'"
                        size="sm"
                        class="tw:bg-sky-100 tw:text-sky-800"
                        >Customers</BaseBadge
                      >
                      <BaseBadge
                        v-if="o.published && o.changedSincePublished"
                        size="sm"
                        class="tw:bg-amber-100 tw:text-amber-800"
                        >Changed since published</BaseBadge
                      >
                      <BaseBadge
                        size="sm"
                        :class="
                          o.published
                            ? 'tw:bg-green-100 tw:text-green-700'
                            : 'tw:bg-gray-100 tw:text-gray-600'
                        "
                        >{{ o.published ? 'Published' : 'Not published' }}</BaseBadge
                      >
                    </div>
                    <div class="tw:flex tw:shrink-0 tw:items-center" @click.stop>
                      <BaseSpinner v-if="busyOp === o.id" size="sm" />
                      <BaseMenu
                        v-else-if="canUpdate || canPublish || canManage"
                        :items="opMenu(o, s)"
                        flip
                      />
                    </div>
                  </BaseClickableRow>
                </div>
              </div>
            </BaseTabPanel>

            <!-- Groups -->
            <BaseTabPanel value="groups">
              <BaseEmptyState
                v-if="!sortedGroups.length"
                :icon="IconFolders"
                dense
                title="No groups yet"
                description="Groups come from the file's tags when it is applied."
              />
              <ul v-else class="tw:flex tw:flex-col tw:gap-2" aria-label="Groups">
                <li
                  v-for="(g, i) in sortedGroups"
                  :key="g.id"
                  class="tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:rounded-md tw:border tw:border-divider tw:bg-card tw:px-3 tw:py-2"
                >
                  <div class="tw:min-w-0 tw:flex-1">
                    <p class="tw:text-sm tw:font-medium">
                      {{ g.title }}
                      <span
                        v-if="g.sourceTag && g.sourceTag !== g.title"
                        class="tw:text-xs tw:font-normal tw:text-secondary"
                        >· tag {{ g.sourceTag }}</span
                      >
                    </p>
                    <p class="tw:text-xs tw:text-secondary">
                      /{{ g.slug }} · {{ g.counts?.published ?? 0 }} of
                      {{ g.counts?.operations ?? 0 }} published
                      <template v-if="g.introMd"> · has an intro</template>
                    </p>
                  </div>
                  <BaseSwitch
                    :modelValue="!!g.published"
                    :disabled="!canPublish"
                    :label="`${g.title} published`"
                    @update:modelValue="(v) => setGroupPublished(g, v)"
                  />
                  <BaseButton v-if="canUpdate" size="sm" variant="outline" @click="editGroup(g)">
                    <IconPencil :size="14" class="tw:mr-1" /> Edit
                  </BaseButton>
                  <div v-if="canUpdate" class="tw:flex tw:items-center">
                    <button
                      type="button"
                      class="tw:rounded tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:disabled:opacity-40"
                      :aria-label="`Move ${g.title} up`"
                      :disabled="i === 0"
                      @click="moveGroup(g, -1)"
                    >
                      <IconArrowUp :size="16" />
                    </button>
                    <button
                      type="button"
                      class="tw:rounded tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:disabled:opacity-40"
                      :aria-label="`Move ${g.title} down`"
                      :disabled="i === sortedGroups.length - 1"
                      @click="moveGroup(g, 1)"
                    >
                      <IconArrowDown :size="16" />
                    </button>
                  </div>
                </li>
              </ul>
            </BaseTabPanel>

            <!-- Settings -->
            <BaseTabPanel value="settings">
              <BaseEmptyState
                v-if="!canManage"
                dense
                title="Portal settings are for KB admins"
                description="Ask someone with the KB Admin or Support Admin role."
              />
              <div v-else-if="settings" class="tw:flex tw:flex-col tw:gap-6">
                <PageSection title="Portal" variant="card">
                  <div class="tw:flex tw:flex-col tw:gap-4">
                    <div class="tw:flex tw:items-center tw:justify-between tw:gap-4">
                      <div>
                        <p class="tw:text-sm tw:font-medium">Portal is published</p>
                        <p class="tw:text-xs tw:text-secondary">
                          Off: /api-help answers “not found” and the help center's header has no
                          link. Only published endpoints ever show.
                        </p>
                      </div>
                      <BaseSwitch
                        v-model="settings.published"
                        :disabled="!canPublish"
                        label="Portal is published"
                      />
                    </div>
                    <BaseTextInput v-model="settings.title" label="Title" placeholder="Acme API" />
                    <BaseTextInput
                      v-model="settings.baseUrl"
                      label="Base URL"
                      placeholder="https://app.example.com/api"
                      instructions="What the code samples call, e.g. https://app.example.com/api"
                    />
                    <div>
                      <p class="tw:mb-1 tw:text-sm tw:font-medium">Intro</p>
                      <div class="tw:rounded-md tw:border tw:border-divider">
                        <KbEditor
                          v-model="settings.introMd"
                          :kbId="kbId"
                          placeholder="What the API is for and how to get started."
                        />
                      </div>
                    </div>
                    <div>
                      <p class="tw:mb-1 tw:text-sm tw:font-medium">Authentication notes</p>
                      <div class="tw:rounded-md tw:border tw:border-divider">
                        <KbEditor
                          v-model="settings.authNotesMd"
                          :kbId="kbId"
                          placeholder="Where to get a key and how to send it."
                        />
                      </div>
                    </div>
                  </div>
                </PageSection>

                <PageSection title="Code samples" variant="card">
                  <div class="tw:flex tw:flex-col tw:gap-4">
                    <div class="tw:flex tw:flex-wrap tw:gap-6">
                      <BaseCheckbox
                        v-for="l in LANGUAGES"
                        :key="l.id"
                        :modelValue="hasLanguage(l.id)"
                        :label="l.label"
                        @update:modelValue="(v) => setLanguage(l.id, v)"
                      />
                    </div>
                    <BaseTextInput
                      v-model="settings.keyPlaceholder"
                      label="API key placeholder"
                      placeholder="YOUR_API_KEY"
                      instructions="Shown in the samples where the key goes."
                    />
                  </div>
                </PageSection>

                <div class="tw:flex tw:items-center tw:justify-end tw:gap-3">
                  <span v-if="settingsDirty" class="tw:text-xs tw:font-medium tw:text-amber-700"
                    >Unsaved changes</span
                  >
                  <BaseButton
                    :disabled="!settingsDirty"
                    :isLoading="savingSettings"
                    @click="saveSettings"
                    >Save</BaseButton
                  >
                </div>
              </div>
            </BaseTabPanel>

            <!-- History -->
            <BaseTabPanel value="history">
              <DataTable
                :columns="importColumns"
                :rows="sortedImports"
                hidePagination
                noDataLabel="No upload yet."
                ariaLabel="Imports"
              >
                <template #body-cell-createdAt="{ value }">{{ when(value) }}</template>
                <template #body-cell-createdBy="{ value }">
                  <UserBadgeById v-if="isUuid(value)" :userId="value" />
                  <span v-else class="tw:text-secondary">{{ value || '—' }}</span>
                </template>
                <template #body-cell-status="{ value }">
                  <BaseBadge
                    size="sm"
                    :class="(IMPORT_STATUS[value] || IMPORT_STATUS.SUPERSEDED).class"
                  >
                    {{ (IMPORT_STATUS[value] || IMPORT_STATUS.SUPERSEDED).label }}
                  </BaseBadge>
                </template>
                <template #body-cell-summary="{ value }">
                  <span class="tw:text-xs tw:text-secondary">{{ summaryOf(value) }}</span>
                </template>
                <template #body-cell-actions="{ row }">
                  <div class="tw:flex tw:items-center tw:justify-end tw:gap-1">
                    <BaseButton size="xs" variant="outline" @click="openReview(row.id)">
                      {{ row.status === 'STAGED' ? 'Review' : 'View review' }}
                    </BaseButton>
                    <BaseButton
                      size="xs"
                      variant="outline"
                      @click="
                        downloadFile(
                          `/v1/services/kb/api-imports/${row.id}/file`,
                          row.filename || 'openapi.json',
                        )
                      "
                    >
                      <IconDownload :size="14" class="tw:mr-1" /> Download file
                    </BaseButton>
                  </div>
                </template>
              </DataTable>
            </BaseTabPanel>
          </div>
        </BaseTabs>
      </div>
    </div>

    <KbApiImportReview
      v-model="reviewOpen"
      :importId="reviewId"
      :canPublish="canPublish"
      :canManage="canManage"
      @applied="loadAll"
      @discarded="loadAll"
    />
    <KbApiOperationEditor
      v-if="kbId"
      v-model="editorOpen"
      :operationId="editorId"
      :kbId="kbId"
      :groups="sortedGroups"
      :canUpdate="canUpdate"
      :canPublish="canPublish"
      :canManage="canManage"
      @saved="loadAll"
      @deleted="loadAll"
    />

    <!-- Group editor -->
    <BaseDialog v-model="groupOpen" title="Edit group" size="2xl">
      <div v-if="groupDraft" class="tw:flex tw:flex-col tw:gap-4">
        <div class="tw:grid tw:gap-3 tw:sm:grid-cols-2">
          <BaseTextInput v-model="groupDraft.title" label="Title" />
          <BaseTextInput v-model="groupDraft.slug" label="Slug" />
        </div>
        <div>
          <p class="tw:mb-1 tw:text-sm tw:font-medium">Intro</p>
          <div class="tw:rounded-md tw:border tw:border-divider">
            <KbEditor
              v-model="groupDraft.introMd"
              :kbId="kbId"
              placeholder="A few lines above this group's endpoints."
            />
          </div>
        </div>
      </div>
      <template #footer>
        <BaseDialogFooter
          :loading="savingGroup"
          :disabled="!groupDraft?.title?.trim()"
          @cancel="groupOpen = false"
          @submit="saveGroup"
        />
      </template>
    </BaseDialog>
  </div>
</template>
