<script setup>
import { IconRestore, IconWorldUpload, IconRobot, IconUpload, IconUser } from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: versions are
// read and restored through /v1/services/kb (they are not synced records).
import { get, post } from '@/api'
import { isAllowed } from '@/utils/currentSession.js'
import { lineDiff, foldDiff, diffStats } from './kbDiff.js'

const props = defineProps({
  articleId: { type: String, required: true },
  kbId: { type: String, required: true },
  /** Unsaved edits in the editor (restoring replaces them). */
  dirty: { type: Boolean, default: false },
})
const emit = defineEmits(['restored'])
/**
 * VERSION HISTORY of one article. Every save is a numbered version (who,
 * when, from where: the desk, the API/Claude, an import). Pick one to see
 * what changed since the version before it, or the article as it was; then
 * restore it (a new version with its content) or publish it.
 */
const open = defineModel({ type: Boolean, default: false })
const toast = useToast()
const { confirm } = useConfirm()
const canEdit = computed(() => isAllowed(['knowledge_base:update']))
const canPublish = computed(() => isAllowed(['knowledge_base:publish']))

const article = useLiveQueryWithDeps(
  [() => props.articleId],
  (db, [id]) => db.KbArticle.findByPk(id),
  { models: ['KbArticle'] },
)

const revisions = ref([])
const loading = ref(false)
const selected = ref(null)
const cache = new Map()
const view = ref('changes')

async function load() {
  loading.value = true
  try {
    const list = (await get(`/v1/services/kb/articles/${props.articleId}/revisions`)).revisions
    revisions.value = [...list].sort((a, b) => b.version - a.version)
    if (!selected.value || !revisions.value.some((r) => r.version === selected.value))
      selected.value = revisions.value[0]?.version ?? null
  } catch (e) {
    toast.error(e.message || 'The history could not be loaded')
  } finally {
    loading.value = false
  }
}
watch(open, (v) => {
  if (v) {
    cache.clear()
    view.value = 'changes'
    load()
  }
})
async function revision(v) {
  if (!v) return null
  if (!cache.has(v))
    cache.set(
      v,
      get(`/v1/services/kb/articles/${props.articleId}/revisions/${v}`).then((r) => r.revision),
    )
  return cache.get(v)
}

const current = ref(null)
const previous = ref(null)
watch(
  [selected, open],
  async ([v, isOpen]) => {
    if (!isOpen || !v) return
    current.value = null
    previous.value = null
    try {
      const prevVersion = revisions.value.find((r) => r.version < v)?.version
      const [cur, prev] = await Promise.all([revision(v), revision(prevVersion)])
      if (selected.value !== v) return
      current.value = cur
      previous.value = prev
    } catch (e) {
      toast.error(e.message || 'That version could not be loaded')
    }
  },
  { immediate: true },
)

const diff = computed(() =>
  current.value ? lineDiff(previous.value?.bodyMd || '', current.value.bodyMd || '') : [],
)
const folded = computed(() => foldDiff(diff.value))
const stats = computed(() => diffStats(diff.value))
const fieldChanges = computed(() => {
  const c = current.value
  const p = previous.value
  if (!c || !p) return []
  const out = []
  if (c.title !== p.title) out.push({ label: 'Title', from: p.title, to: c.title })
  if ((c.summary || '') !== (p.summary || ''))
    out.push({ label: 'Summary', from: p.summary || '—', to: c.summary || '—' })
  if (c.audience !== p.audience)
    out.push({
      label: 'Who sees it',
      from: p.audience === 'AGENTS' ? 'Agents only' : 'Public',
      to: c.audience === 'AGENTS' ? 'Agents only' : 'Public',
    })
  if (c.slug !== p.slug)
    out.push({ label: 'Address', from: `/articles/${p.slug}`, to: `/articles/${c.slug}` })
  return out
})

function sourceLabel(r) {
  if (r.source === 'API') return 'API'
  if (r.source === 'IMPORT') return 'Import'
  return 'Desk'
}
function sourceIcon(r) {
  return r.source === 'API' ? IconRobot : r.source === 'IMPORT' ? IconUpload : IconUser
}
function when(d) {
  return d?.formatDate ? d.formatDate('datetime') : ''
}

async function restore() {
  const v = selected.value
  const ok = await confirm({
    title: `Restore version ${v}?`,
    message: props.dirty
      ? `Your unsaved changes are discarded. Version ${v}'s content becomes a new version; nothing is lost from the history.`
      : `Version ${v}'s content becomes a new version. Nothing is lost from the history.`,
    okLabel: 'Restore',
  })
  if (!ok) return
  try {
    const res = await post(`/v1/services/kb/articles/${props.articleId}/restore`, { version: v })
    toast.success(`Version ${v} restored as version ${res.article.version}`)
    emit('restored', res.article)
    open.value = false
  } catch (e) {
    toast.error(e.message || 'That version could not be restored')
  }
}
async function publishSelected() {
  const v = selected.value
  try {
    await post(`/v1/services/kb/articles/${props.articleId}/publish`, { version: v })
    toast.success(`Version ${v} is live`)
    await load()
  } catch (e) {
    toast.error(e.message || 'That version could not be published')
  }
}
</script>

<template>
  <BaseDialog v-model="open" title="Version history" size="6xl">
    <div class="tw:flex tw:h-[70vh] tw:min-h-0 tw:gap-4">
      <!-- Versions -->
      <ul
        class="tw:w-72 tw:shrink-0 tw:overflow-y-auto tw:rounded-md tw:border tw:border-divider"
        aria-label="Versions"
      >
        <li v-if="loading && !revisions.length" class="tw:p-4"><BaseSpinner /></li>
        <li
          v-for="r in revisions"
          :key="r.id"
          class="tw:border-b tw:border-divider tw:last:border-0"
        >
          <button
            type="button"
            :aria-current="selected === r.version ? 'true' : undefined"
            :class="[
              'tw:flex tw:w-full tw:flex-col tw:gap-1 tw:px-3 tw:py-2.5 tw:text-left',
              selected === r.version ? 'tw:bg-primary/10' : 'tw:hover:bg-main-hover',
            ]"
            @click="selected = r.version"
          >
            <span class="tw:flex tw:items-center tw:gap-1.5">
              <span class="tw:text-sm tw:font-semibold">Version {{ r.version }}</span>
              <BaseBadge
                v-if="r.version === article?.publishedVersion"
                size="sm"
                class="tw:bg-green-100 tw:text-green-700"
                >Live</BaseBadge
              >
              <BaseBadge v-else-if="r.publishedAt" size="sm" class="tw:bg-gray-100 tw:text-gray-600"
                >Was live</BaseBadge
              >
              <BaseBadge
                v-if="r.version === article?.version"
                size="sm"
                class="tw:bg-blue-100 tw:text-blue-700"
                >Current</BaseBadge
              >
            </span>
            <span class="tw:flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary">
              <component :is="sourceIcon(r)" :size="13" />
              <UserBadgeById v-if="r.authorId" :userId="r.authorId" size="sm" />
              <span v-else>{{ sourceLabel(r) }}</span>
            </span>
            <span class="tw:text-xs tw:text-secondary">{{ when(r.createdAt) }}</span>
            <span v-if="r.publishedAt" class="tw:text-xs tw:text-green-700"
              >Published {{ when(r.publishedAt) }}</span
            >
            <span v-if="r.note" class="tw:truncate tw:text-xs tw:italic tw:text-secondary">{{
              r.note
            }}</span>
          </button>
        </li>
      </ul>

      <!-- The selected version -->
      <section class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-3" aria-label="Version">
        <div v-if="selected" class="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
          <BaseTabs
            v-model="view"
            :tabs="[
              { value: 'changes', label: 'Changes' },
              { value: 'article', label: 'Article' },
            ]"
            ariaLabel="Show"
          />
          <span v-if="current && view === 'changes'" class="tw:text-xs tw:text-secondary">
            <template v-if="previous"
              >Compared with version {{ previous.version }}:
              <span class="tw:text-green-700">+{{ stats.added }}</span>
              <span class="tw:text-red-700">−{{ stats.removed }}</span> lines</template
            >
            <template v-else>The first version</template>
          </span>
          <div class="tw:flex-1" />
          <BaseButton
            v-if="canEdit && selected !== article?.version"
            variant="outline"
            size="sm"
            @click="restore"
          >
            <IconRestore :size="15" class="tw:mr-1" /> Restore this version
          </BaseButton>
          <BaseButton
            v-if="canPublish && selected !== article?.publishedVersion"
            size="sm"
            @click="publishSelected"
          >
            <IconWorldUpload :size="15" class="tw:mr-1" /> Publish this version
          </BaseButton>
        </div>

        <div
          v-if="!current"
          class="tw:flex tw:flex-1 tw:items-center tw:justify-center tw:rounded-md tw:border tw:border-divider"
        >
          <BaseSpinner />
        </div>

        <div
          v-else-if="view === 'changes'"
          class="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:rounded-md tw:border tw:border-divider"
        >
          <dl
            v-if="fieldChanges.length"
            class="tw:grid tw:grid-cols-[8rem_1fr] tw:gap-x-3 tw:gap-y-1 tw:border-b tw:border-divider tw:p-3 tw:text-sm"
          >
            <template v-for="f in fieldChanges" :key="f.label">
              <dt class="tw:text-secondary">{{ f.label }}</dt>
              <dd>
                <del class="tw:text-red-700">{{ f.from }}</del>
                <span class="tw:mx-1 tw:text-secondary">to</span>
                <ins class="tw:text-green-700 tw:no-underline">{{ f.to }}</ins>
              </dd>
            </template>
          </dl>
          <p v-if="!stats.added && !stats.removed" class="tw:p-3 tw:text-sm tw:text-secondary">
            The text did not change in this version.
          </p>
          <div v-else class="tw:py-1 tw:text-[0.8125rem] tw:leading-6" aria-label="Changed lines">
            <div
              v-for="(row, i) in folded"
              :key="i"
              :class="[
                'tw:flex tw:whitespace-pre-wrap tw:break-words tw:px-3',
                row.type === 'add' && 'tw:bg-green-50 tw:text-green-900',
                row.type === 'del' && 'tw:bg-red-50 tw:text-red-900 tw:line-through',
                row.type === 'skip' && 'tw:bg-main tw:text-xs tw:text-secondary',
              ]"
            >
              <span class="tw:w-5 tw:shrink-0 tw:select-none tw:text-secondary">{{
                row.type === 'add' ? '+' : row.type === 'del' ? '−' : ''
              }}</span>
              <span v-if="row.type === 'skip'"
                >{{ row.count }} unchanged line{{ row.count === 1 ? '' : 's' }}</span
              >
              <span v-else>{{ row.text || ' ' }}</span>
            </div>
          </div>
        </div>

        <div
          v-else
          class="tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:rounded-md tw:border tw:border-divider"
        >
          <p
            class="tw:border-b tw:border-divider tw:px-8 tw:pt-4 tw:pb-2 tw:text-xl tw:font-semibold"
          >
            {{ current.title }}
          </p>
          <KbEditor
            :key="current.version"
            :modelValue="current.bodyMd || ''"
            :kbId="kbId"
            :articleId="articleId"
            :editable="false"
            bare
          />
        </div>
      </section>
    </div>
  </BaseDialog>
</template>
