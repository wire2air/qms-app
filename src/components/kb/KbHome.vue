<script setup>
import {
  IconArrowLeft,
  IconBook2,
  IconFolder,
  IconFolderPlus,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconFiles,
  IconInbox,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: KB writes go
// through /v1/services/kb (versions, slugs, redirects are the server's).
import { post, put, del } from '@/api'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

/**
 * THE KNOWLEDGE BASE, IN THE SUPPORT DESK (backend services/kbArticleService.js)
 *
 * One knowledge base per support brand. Left: its collections (the help
 * center's categories); main: its articles, public and agents-only, filtered
 * by collection, state and audience, searched by title, summary, tags and
 * text. Reads come from the sync engine (KbKnowledgeBase / KbCollection /
 * KbArticle); writes are the desk's /v1/services/kb routes.
 *
 * Who sees what: everyone with knowledge_base:read reads every article here;
 * create/update write, publish publishes, manage_settings shapes collections.
 */
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { confirm } = useConfirm()

const canCreate = computed(() => isAllowed(['knowledge_base:create']))
const canManage = computed(() => isAllowed(['knowledge_base:manage_settings']))
const canDelete = computed(() => isAllowed(['knowledge_base:delete']) || canManage.value)

// A brand made after the knowledge base existed gets its KB here.
const ensured = ref(false)
onMounted(async () => {
  try {
    await post('/v1/services/kb/bases/ensure', {})
  } catch {
    // Reading still works from what is synced.
  } finally {
    ensured.value = true
  }
})

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
  set: (v) =>
    router.replace({ query: { ...route.query, kb: v || undefined, collection: undefined } }),
})
const kb = computed(() => bases.value.find((k) => k.id === kbId.value) || null)

const collections = useLiveQueryWithDeps(
  [() => kbId.value],
  async (db, [id]) => (id ? db.KbCollection.where('kbId', id).exec() : []),
  { models: ['KbCollection'], initial: [] },
)
const articles = useLiveQueryWithDeps(
  [() => kbId.value],
  async (db, [id]) => (id ? db.KbArticle.where('kbId', id).exec() : []),
  { models: ['KbArticle'], initial: [] },
)

// ── Collections tree (flattened, depth-indented) ────────────────────────────
const tree = computed(() => {
  const byParent = new Map()
  for (const c of collections.value) {
    const k = c.parentId || ''
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k).push(c)
  }
  const out = []
  function walk(parent, depth) {
    for (const c of (byParent.get(parent) || []).sort(
      (a, b) => a.position - b.position || a.title.localeCompare(b.title),
    )) {
      out.push({ c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk('', 0)
  return out
})
const counts = computed(() => {
  const m = new Map()
  for (const a of articles.value)
    m.set(a.collectionId || '', (m.get(a.collectionId || '') || 0) + 1)
  return m
})

// ── Filters ──────────────────────────────────────────────────────────────────
const collectionFilter = computed({
  get: () => route.query.collection || 'all',
  set: (v) =>
    router.replace({ query: { ...route.query, collection: v === 'all' ? undefined : v } }),
})
const stateFilter = ref('all')
const audienceFilter = ref('all')
const search = ref('')
const STATE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'PENDING', label: 'Changes not published' },
  { value: 'ARCHIVED', label: 'Archived' },
]
const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'Everyone' },
  { value: 'PUBLIC', label: 'Public' },
  { value: 'AGENTS', label: 'Agents only' },
]

const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return articles.value
    .filter((a) => {
      if (collectionFilter.value === 'none' && a.collectionId) return false
      if (
        !['all', 'none'].includes(collectionFilter.value) &&
        a.collectionId !== collectionFilter.value
      )
        return false
      if (stateFilter.value === 'PENDING') {
        if (!a.hasUnpublishedChanges) return false
      } else if (stateFilter.value !== 'all' && a.status !== stateFilter.value) return false
      if (stateFilter.value === 'all' && a.status === 'ARCHIVED') return false
      if (audienceFilter.value !== 'all' && a.audience !== audienceFilter.value) return false
      if (!q) return true
      const hay =
        `${a.title} ${a.summary || ''} ${(a.tags || []).join(' ')} ${a.bodyMd || ''}`.toLowerCase()
      return q.split(/\s+/).every((w) => hay.includes(w))
    })
    .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
})
const collectionTitle = (id) => collections.value.find((c) => c.id === id)?.title || ''

// ── Actions ──────────────────────────────────────────────────────────────────
const creating = ref(false)
async function newArticle() {
  if (!kbId.value || creating.value) return
  creating.value = true
  try {
    const collectionId = ['all', 'none'].includes(collectionFilter.value)
      ? null
      : collectionFilter.value
    const res = await post(`/v1/services/kb/bases/${kbId.value}/articles`, {
      title: 'Untitled article',
      collectionId,
      audience: collections.value.find((c) => c.id === collectionId)?.audience || 'PUBLIC',
    })
    router.push(getCompanyPath(`/desk/kb/${res.article.id}`))
  } catch (e) {
    toast.error(e.message || 'The article could not be created')
  } finally {
    creating.value = false
  }
}

const collectionDialog = ref({
  open: false,
  id: null,
  title: '',
  description: '',
  audience: 'PUBLIC',
  parentId: null,
})
function openCollection(c = null, parentId = null) {
  collectionDialog.value = c
    ? {
        open: true,
        id: c.id,
        title: c.title,
        description: c.description || '',
        audience: c.audience,
        parentId: c.parentId,
      }
    : { open: true, id: null, title: '', description: '', audience: 'PUBLIC', parentId }
}
const parentOptions = computed(() => [
  { value: null, label: '— Top level —' },
  ...tree.value
    .filter((t) => t.c.id !== collectionDialog.value.id && t.depth < 2)
    .map((t) => ({ value: t.c.id, label: `${'— '.repeat(t.depth)}${t.c.title}` })),
])
async function saveCollection() {
  const d = collectionDialog.value
  if (!d.title.trim()) return toast.error('Give the collection a title')
  const body = {
    title: d.title,
    description: d.description || null,
    audience: d.audience,
    parentId: d.parentId || null,
  }
  try {
    if (d.id) await put(`/v1/services/kb/collections/${d.id}`, body)
    else await post(`/v1/services/kb/bases/${kbId.value}/collections`, body)
    collectionDialog.value.open = false
    toast.success(d.id ? 'Collection saved' : 'Collection added')
  } catch (e) {
    toast.error(e.message || 'The collection could not be saved')
  }
}
async function deleteCollection(c) {
  const ok = await confirm({
    title: `Delete “${c.title}”?`,
    message: 'Only an empty collection can be deleted.',
    okLabel: 'Delete',
  })
  if (!ok) return
  try {
    await del(`/v1/services/kb/collections/${c.id}`)
    if (collectionFilter.value === c.id) collectionFilter.value = 'all'
    toast.success('Collection deleted')
  } catch (e) {
    toast.error(e.message || 'The collection could not be deleted')
  }
}

function openArticle(a) {
  router.push(getCompanyPath(`/desk/kb/${a.id}`))
}
const itemClass = (active) => [
  'tw:flex tw:w-full tw:items-center tw:gap-2 tw:rounded-md tw:px-2 tw:py-1.5 tw:text-left tw:text-sm',
  active
    ? 'tw:bg-main-hover tw:font-medium tw:text-on-main'
    : 'tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main',
]
</script>

<template>
  <div
    class="tw:flex tw:h-screen tw:w-full tw:flex-col tw:overflow-hidden tw:bg-main tw:text-on-main"
  >
    <header
      class="tw:flex tw:items-center tw:gap-2 tw:border-b tw:border-divider tw:bg-card tw:px-4 tw:py-2"
    >
      <button
        class="tw:rounded-md tw:p-1 tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main"
        aria-label="Back to inbox"
        @click="router.push(getCompanyPath('/desk'))"
      >
        <IconArrowLeft :size="18" />
      </button>
      <IconBook2 :size="18" class="tw:text-primary" />
      <BaseHeading :level="1" class="tw:text-sm tw:font-semibold">Knowledge base</BaseHeading>
      <div v-if="baseOptions.length > 1" class="tw:w-56">
        <BaseSelect v-model="kbId" :options="baseOptions" required aria-label="Knowledge base" />
      </div>
      <span v-else-if="kb" class="tw:text-sm tw:text-secondary">{{ kb.name }}</span>
      <BaseBadge
        v-if="kb"
        size="sm"
        :class="
          kb.status === 'LIVE'
            ? 'tw:bg-green-100 tw:text-green-700'
            : 'tw:bg-gray-100 tw:text-gray-600'
        "
      >
        Help center {{ kb.status === 'LIVE' ? 'live' : 'not live yet' }}
      </BaseBadge>
      <div class="tw:flex-1" />
      <BaseButton v-if="canCreate && kb" :isLoading="creating" @click="newArticle">
        <IconPlus :size="16" class="tw:mr-1" /> New article
      </BaseButton>
    </header>

    <div v-if="!kb" class="tw:flex tw:flex-1 tw:items-center tw:justify-center">
      <BaseSpinner v-if="!ensured" />
      <BaseEmptyState
        v-else
        :icon="IconBook2"
        title="No knowledge base yet"
        description="Each support brand gets a knowledge base. Add a brand in Desk settings first."
      />
    </div>

    <div v-else class="tw:flex tw:min-h-0 tw:flex-1">
      <!-- Collections -->
      <aside
        class="tw:flex tw:w-64 tw:shrink-0 tw:flex-col tw:gap-1 tw:overflow-y-auto tw:border-r tw:border-divider tw:bg-card tw:p-2"
        aria-label="Collections"
      >
        <button :class="itemClass(collectionFilter === 'all')" @click="collectionFilter = 'all'">
          <IconFiles :size="16" /> <span class="tw:flex-1">All articles</span>
          <span class="tw:text-xs tw:text-secondary">{{ articles.length }}</span>
        </button>
        <button :class="itemClass(collectionFilter === 'none')" @click="collectionFilter = 'none'">
          <IconInbox :size="16" /> <span class="tw:flex-1">No collection</span>
          <span class="tw:text-xs tw:text-secondary">{{ counts.get('') || 0 }}</span>
        </button>
        <div
          class="tw:mt-3 tw:flex tw:items-center tw:justify-between tw:px-2 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
        >
          Collections
          <button
            v-if="canManage || canCreate"
            class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
            aria-label="Add a collection"
            title="Add a collection"
            @click="openCollection()"
          >
            <IconFolderPlus :size="16" />
          </button>
        </div>
        <p v-if="!tree.length" class="tw:px-2 tw:text-xs tw:text-secondary">
          Collections are the help center's categories, like “Getting started” or “Billing”.
        </p>
        <div
          v-for="t in tree"
          :key="t.c.id"
          class="tw:group tw:flex tw:items-center"
          :style="{ paddingLeft: `${t.depth * 12}px` }"
        >
          <button
            :class="itemClass(collectionFilter === t.c.id)"
            @click="collectionFilter = t.c.id"
          >
            <IconFolder :size="16" />
            <span class="tw:flex-1 tw:truncate">{{ t.c.title }}</span>
            <KbAudienceBadge v-if="t.c.audience === 'AGENTS'" audience="AGENTS" />
            <span class="tw:text-xs tw:text-secondary">{{ counts.get(t.c.id) || 0 }}</span>
          </button>
          <BaseMenu
            v-if="canManage || canCreate"
            class="tw:opacity-0 tw:group-hover:opacity-100 tw:focus-within:opacity-100"
            :items="[
              { name: 'Edit', icon: IconPencil, click: () => openCollection(t.c) },
              {
                name: 'Add a sub-collection',
                icon: IconFolderPlus,
                click: () => openCollection(null, t.c.id),
                disabled: t.depth >= 2,
              },
              {
                name: 'Delete',
                icon: IconTrash,
                click: () => deleteCollection(t.c),
                disabled: !canDelete,
              },
            ]"
          />
        </div>
      </aside>

      <!-- Articles -->
      <main class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
        <div
          class="tw:flex tw:flex-wrap tw:items-center tw:gap-3 tw:border-b tw:border-divider tw:bg-card tw:px-4 tw:py-2"
        >
          <div class="tw:relative tw:w-72">
            <IconSearch
              :size="16"
              class="tw:pointer-events-none tw:absolute tw:left-2.5 tw:top-1/2 tw:-translate-y-1/2 tw:text-secondary"
            />
            <input
              v-model="search"
              type="search"
              placeholder="Search titles, tags and text"
              aria-label="Search articles"
              class="tw:h-8 tw:w-full tw:rounded-md tw:border tw:border-divider tw:bg-main tw:pl-8 tw:pr-2 tw:text-sm"
            />
          </div>
          <SegmentedControl
            v-model="stateFilter"
            :options="STATE_OPTIONS"
            size="sm"
            :equalWidth="false"
            ariaLabel="State"
          />
          <SegmentedControl
            v-model="audienceFilter"
            :options="AUDIENCE_OPTIONS"
            size="sm"
            :equalWidth="false"
            ariaLabel="Audience"
          />
        </div>

        <div class="tw:min-h-0 tw:flex-1 tw:overflow-y-auto">
          <BaseEmptyState
            v-if="!articles.length"
            class="tw:mt-16"
            :icon="IconBook2"
            title="No articles yet"
            :description="
              canCreate
                ? 'Write answers once: public articles for the help center, agents-only ones for the team. Start with “New article”.'
                : 'Articles appear here once someone with the KB Editor role writes them.'
            "
          />
          <BaseEmptyState
            v-else-if="!rows.length"
            class="tw:mt-16"
            :icon="IconSearch"
            title="No article matches"
            description="Change the filters or the search."
          />
          <ul v-else class="tw:divide-y tw:divide-divider" aria-label="Articles">
            <li v-for="a in rows" :key="a.id">
              <BaseClickableRow
                class="tw:flex tw:items-start tw:gap-3 tw:px-4 tw:py-3 tw:hover:bg-main-hover"
                :aria-label="`Open ${a.title}`"
                @click="openArticle(a)"
              >
                <div class="tw:min-w-0 tw:flex-1">
                  <div class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                    <span class="tw:truncate tw:font-medium">{{ a.title }}</span>
                    <KbStatusBadge :status="a.status" :pendingChanges="a.hasUnpublishedChanges" />
                    <KbAudienceBadge :audience="a.audience" />
                  </div>
                  <p v-if="a.summary" class="tw:mt-0.5 tw:truncate tw:text-sm tw:text-secondary">
                    {{ a.summary }}
                  </p>
                  <p class="tw:mt-0.5 tw:text-xs tw:text-secondary">
                    <span v-if="a.collectionId">{{ collectionTitle(a.collectionId) }} · </span>
                    /articles/{{ a.slug }} · v{{ a.version }} · updated
                    {{ a.updatedAt?.formatDate('date') }}
                  </p>
                </div>
              </BaseClickableRow>
            </li>
          </ul>
        </div>
      </main>
    </div>

    <BaseDialog
      v-model="collectionDialog.open"
      :title="collectionDialog.id ? 'Edit collection' : 'New collection'"
    >
      <div class="tw:flex tw:flex-col tw:gap-4">
        <BaseTextInput
          v-model="collectionDialog.title"
          label="Title"
          placeholder="Getting started"
          required
        />
        <BaseTextarea
          v-model="collectionDialog.description"
          label="Description"
          :rows="2"
          placeholder="Shown under the title on the help center"
        />
        <div>
          <p class="tw:mb-1 tw:text-sm tw:font-medium">Inside</p>
          <BaseSelect
            v-model="collectionDialog.parentId"
            :options="parentOptions"
            aria-label="Parent collection"
          />
        </div>
        <div>
          <p class="tw:mb-1 tw:text-sm tw:font-medium">Who sees it</p>
          <SegmentedControl
            v-model="collectionDialog.audience"
            :options="[
              { value: 'PUBLIC', label: 'Public' },
              { value: 'AGENTS', label: 'Agents only' },
            ]"
            ariaLabel="Who sees it"
          />
          <p class="tw:mt-1 tw:text-xs tw:text-secondary">
            A public collection is a category of the help center; agents-only collections never show
            there.
          </p>
        </div>
      </div>
      <template #footer>
        <BaseDialogFooter
          :submitLabel="collectionDialog.id ? 'Save' : 'Add collection'"
          @cancel="collectionDialog.open = false"
          @submit="saveCollection"
        />
      </template>
    </BaseDialog>
  </div>
</template>
