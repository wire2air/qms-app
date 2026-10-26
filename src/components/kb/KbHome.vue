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
  IconChevronRight,
  IconArrowUp,
  IconArrowDown,
  IconFolderOpen,
  IconWorldCog,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: KB writes go
// through /v1/services/kb (versions, slugs, redirects are the server's).
import { post, put, del } from '@/api'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import {
  kbChildren,
  kbCollectionTree,
  kbCollectionOptions,
  kbDescendantIds,
  KB_FOLDER_MAX_DEPTH,
} from './kbCollections.js'
import { AUDIENCE_OPTIONS } from './kbAudience.js'

/**
 * THE KNOWLEDGE BASE, IN THE SUPPORT DESK (backend services/kbArticleService.js)
 *
 * One knowledge base per support brand. Left: its folders, nested up to three
 * levels (the help center's categories and sections); main: its articles,
 * public and agents-only, filtered by folder (with its sub-folders), state and
 * audience, searched by title, summary, tags and text. Reads come from the sync engine (KbKnowledgeBase / KbCollection /
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

// ── Folders (a tree; folded folders hide their sub-folders) ─────────────────
const tree = computed(() => kbCollectionTree(collections.value))
const folded = ref(new Set())
function toggleFold(id) {
  const next = new Set(folded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  folded.value = next
}
const childrenOf = computed(() => kbChildren(collections.value))
const hasChildren = (id) => (childrenOf.value.get(id) || []).length > 0
const visibleTree = computed(() => {
  const hidden = new Set()
  return tree.value.filter((t) => {
    if (t.c.parentId && (hidden.has(t.c.parentId) || folded.value.has(t.c.parentId))) {
      hidden.add(t.c.id)
      return false
    }
    return true
  })
})
/** Articles per folder, counting its sub-folders too. */
const counts = computed(() => {
  const direct = new Map()
  for (const a of articles.value) {
    if (a.status === 'ARCHIVED') continue
    direct.set(a.collectionId || '', (direct.get(a.collectionId || '') || 0) + 1)
  }
  const total = new Map([['', direct.get('') || 0]])
  for (const t of tree.value) {
    let n = 0
    for (const id of kbDescendantIds(collections.value, t.c.id)) n += direct.get(id) || 0
    total.set(t.c.id, n)
  }
  return total
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
const AUDIENCE_FILTERS = [{ value: 'all', label: 'Everyone' }, ...AUDIENCE_OPTIONS]

const inFolder = computed(() =>
  ['all', 'none'].includes(collectionFilter.value)
    ? new Set()
    : kbDescendantIds(collections.value, collectionFilter.value),
)
const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return articles.value
    .filter((a) => {
      if (collectionFilter.value === 'none' && a.collectionId) return false
      if (!['all', 'none'].includes(collectionFilter.value) && !inFolder.value.has(a.collectionId))
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
const folderPaths = computed(
  () => new Map(kbCollectionOptions(collections.value).map((o) => [o.value, o.label])),
)
const collectionTitle = (id) => folderPaths.value.get(id) || ''

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
const parentOptions = computed(() => {
  // Not inside itself or its own sub-folders, and the result stays ≤ 3 levels.
  const own = collectionDialog.value.id
    ? kbDescendantIds(collections.value, collectionDialog.value.id)
    : new Set()
  return [
    { value: null, label: '— Top level —' },
    ...tree.value
      .filter((t) => !own.has(t.c.id) && t.depth < KB_FOLDER_MAX_DEPTH - 1)
      .map((t) => ({ value: t.c.id, label: t.path.join(' › ') })),
  ]
})
async function saveCollection() {
  const d = collectionDialog.value
  if (!d.title.trim()) return toast.error('Give the folder a name')
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
    if (!d.id && d.parentId && folded.value.has(d.parentId)) toggleFold(d.parentId)
    toast.success(d.id ? 'Folder saved' : 'Folder added')
  } catch (e) {
    toast.error(e.message || 'The folder could not be saved')
  }
}
async function deleteCollection(c) {
  const ok = await confirm({
    title: `Delete “${c.title}”?`,
    message: 'Only an empty folder (no articles, no sub-folders) can be deleted.',
    okLabel: 'Delete',
  })
  if (!ok) return
  try {
    await del(`/v1/services/kb/collections/${c.id}`)
    if (collectionFilter.value === c.id) collectionFilter.value = 'all'
    toast.success('Folder deleted')
  } catch (e) {
    toast.error(e.message || 'The folder could not be deleted')
  }
}
async function move(c, step) {
  const siblings = childrenOf.value.get(c.parentId || '') || []
  const ids = siblings.map((x) => x.id)
  const i = ids.indexOf(c.id)
  const j = i + step
  if (i < 0 || j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  try {
    await post(`/v1/services/kb/bases/${kbId.value}/collections/reorder`, {
      parentId: c.parentId || null,
      ids,
    })
  } catch (e) {
    toast.error(e.message || 'The folders could not be reordered')
  }
}
function folderMenu(t) {
  const siblings = childrenOf.value.get(t.c.parentId || '') || []
  const i = siblings.findIndex((x) => x.id === t.c.id)
  return [
    { name: 'Edit', icon: IconPencil, click: () => openCollection(t.c) },
    {
      name: 'New sub-folder',
      icon: IconFolderPlus,
      click: () => openCollection(null, t.c.id),
      disabled: t.depth >= KB_FOLDER_MAX_DEPTH - 1,
      title: t.depth >= KB_FOLDER_MAX_DEPTH - 1 ? 'Folders nest three levels deep' : undefined,
    },
    { name: 'Move up', icon: IconArrowUp, click: () => move(t.c, -1), disabled: i <= 0 },
    {
      name: 'Move down',
      icon: IconArrowDown,
      click: () => move(t.c, 1),
      disabled: i < 0 || i >= siblings.length - 1,
    },
    {
      name: 'Delete',
      icon: IconTrash,
      click: () => deleteCollection(t.c),
      disabled: !canDelete.value,
    },
  ]
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
      <BaseButton
        v-if="canManage && kb"
        variant="outline"
        @click="router.push(getCompanyPath(`/desk/kb/settings?kb=${kb.id}`))"
      >
        <IconWorldCog :size="16" class="tw:mr-1" /> Help center
      </BaseButton>
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
        aria-label="Folders"
      >
        <button :class="itemClass(collectionFilter === 'all')" @click="collectionFilter = 'all'">
          <IconFiles :size="16" /> <span class="tw:flex-1">All articles</span>
          <span class="tw:text-xs tw:text-secondary">{{ articles.length }}</span>
        </button>
        <button :class="itemClass(collectionFilter === 'none')" @click="collectionFilter = 'none'">
          <IconInbox :size="16" /> <span class="tw:flex-1">Not in a folder</span>
          <span class="tw:text-xs tw:text-secondary">{{ counts.get('') || 0 }}</span>
        </button>
        <div
          class="tw:mt-3 tw:flex tw:items-center tw:justify-between tw:px-2 tw:text-xs tw:font-semibold tw:uppercase tw:tracking-wide tw:text-secondary"
        >
          Folders
          <button
            v-if="canManage || canCreate"
            class="tw:rounded tw:p-0.5 tw:hover:bg-main-hover"
            aria-label="New folder"
            title="New folder"
            @click="openCollection()"
          >
            <IconFolderPlus :size="16" />
          </button>
        </div>
        <p v-if="!tree.length" class="tw:px-2 tw:text-xs tw:text-secondary">
          Folders are the help center's categories, like “Getting started” or “Billing”. Put
          sub-folders inside them.
        </p>
        <ul class="tw:flex tw:flex-col tw:gap-0.5" role="tree" aria-label="Folders">
          <li
            v-for="t in visibleTree"
            :key="t.c.id"
            role="treeitem"
            :aria-level="t.depth + 1"
            :aria-expanded="hasChildren(t.c.id) ? !folded.has(t.c.id) : undefined"
            :aria-selected="collectionFilter === t.c.id"
            class="tw:group tw:flex tw:items-center"
            :style="{ paddingLeft: `${t.depth * 14}px` }"
          >
            <button
              v-if="hasChildren(t.c.id)"
              type="button"
              class="tw:flex tw:h-7 tw:w-5 tw:shrink-0 tw:items-center tw:justify-center tw:rounded tw:text-secondary tw:hover:bg-main-hover"
              :aria-label="
                folded.has(t.c.id)
                  ? `Show ${t.c.title}'s sub-folders`
                  : `Hide ${t.c.title}'s sub-folders`
              "
              @click="toggleFold(t.c.id)"
            >
              <IconChevronRight
                :size="14"
                :class="['tw:transition-transform', !folded.has(t.c.id) && 'tw:rotate-90']"
              />
            </button>
            <span v-else class="tw:w-5 tw:shrink-0" />
            <button
              :class="itemClass(collectionFilter === t.c.id)"
              @click="collectionFilter = t.c.id"
            >
              <component
                :is="collectionFilter === t.c.id ? IconFolderOpen : IconFolder"
                :size="16"
                class="tw:shrink-0"
              />
              <span class="tw:flex-1 tw:truncate">{{ t.c.title }}</span>
              <KbAudienceBadge v-if="t.c.audience !== 'PUBLIC'" :audience="t.c.audience" />
              <span class="tw:text-xs tw:text-secondary">{{ counts.get(t.c.id) || 0 }}</span>
            </button>
            <BaseMenu
              v-if="canManage || canCreate"
              class="tw:opacity-0 tw:group-hover:opacity-100 tw:focus-within:opacity-100"
              :items="folderMenu(t)"
            />
          </li>
        </ul>
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
            :options="AUDIENCE_FILTERS"
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
      :title="collectionDialog.id ? 'Edit folder' : 'New folder'"
    >
      <div class="tw:flex tw:flex-col tw:gap-4">
        <BaseTextInput
          v-model="collectionDialog.title"
          label="Name"
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
            aria-label="Parent folder"
          />
        </div>
        <div>
          <p class="tw:mb-1 tw:text-sm tw:font-medium">Who sees it</p>
          <BaseSelect
            v-model="collectionDialog.audience"
            :options="AUDIENCE_OPTIONS"
            required
            aria-label="Who sees it"
          />
          <p class="tw:mt-1 tw:text-xs tw:text-secondary">
            A public folder is a category of the help center. Customer folders appear only in your
            product's in-app help; agents-only folders only in the desk.
          </p>
        </div>
      </div>
      <template #footer>
        <BaseDialogFooter
          :submitLabel="collectionDialog.id ? 'Save' : 'Add folder'"
          @cancel="collectionDialog.open = false"
          @submit="saveCollection"
        />
      </template>
    </BaseDialog>
  </div>
</template>
