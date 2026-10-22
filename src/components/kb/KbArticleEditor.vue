<script setup>
import {
  IconArrowLeft,
  IconHistory,
  IconWorldUpload,
  IconWorldOff,
  IconArchive,
  IconTrash,
  IconAlertTriangle,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: an article
// save writes a numbered version, renders it and may write a redirect.
import { post, put, del } from '@/api'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useUnsavedChangesGuard } from '@shared/composables/useUnsavedChangesGuard.js'
import KbEditor from './editor/KbEditor.vue'
import { kbCollectionOptions } from './kbCollections.js'

/**
 * ONE KNOWLEDGE BASE ARTICLE (backend services/kbArticleService.js).
 *
 * The article row (synced) is the CURRENT draft; this editor holds a local
 * copy, and Save sends it with the version it was made from. If someone
 * else saved meanwhile, the server refuses (409) and the banner offers their
 * version — nobody's work is overwritten. Publishing makes a version live;
 * later saves stay drafts until published again ("Changes not published").
 *
 * The text is Markdown, edited visually (editor/KbEditor.vue): images, files,
 * videos, callouts, sections, buttons, tables, article links and dynamic
 * content all have a Markdown form, so what Claude pushes and what an agent
 * writes are the same kind of article.
 */
const props = defineProps({ articleId: { type: String, required: true } })
const router = useRouter()
const toast = useToast()
const { confirm } = useConfirm()

const canEdit = computed(() => isAllowed(['knowledge_base:update']))
const canPublish = computed(() => isAllowed(['knowledge_base:publish']))
const canDelete = computed(() => isAllowed(['knowledge_base:delete']))

const article = useLiveQueryWithDeps(
  [() => props.articleId],
  (db, [id]) => db.KbArticle.findByPk(id),
  { models: ['KbArticle'] },
)
const collections = useLiveQueryWithDeps(
  [() => article.value?.kbId],
  async (db, [kbId]) => (kbId ? db.KbCollection.where('kbId', kbId).exec() : []),
  { models: ['KbCollection'], initial: [] },
)
const collectionOptions = computed(() => [
  { value: null, label: '— No folder —' },
  ...kbCollectionOptions(collections.value),
])

// ── The local draft ──────────────────────────────────────────────────────────
const draft = ref(null)
const baseVersion = ref(null)
function snapshot(a) {
  return {
    title: a.title,
    summary: a.summary || '',
    bodyMd: a.bodyMd || '',
    audience: a.audience,
    collectionId: a.collectionId || null,
    slug: a.slug,
    tags: [...(a.tags || [])],
    writtenById: a.writtenById || null,
  }
}
function loadFrom(a) {
  draft.value = snapshot(a)
  baseVersion.value = a.version
}
/** The article as the draft started from (what "unsaved changes" compares against). */
const snapshotAtBase = ref(null)
const dirty = computed(
  () =>
    !!draft.value &&
    !!article.value &&
    JSON.stringify(draft.value) !== JSON.stringify(snapshotAtBase.value),
)
watch(
  article,
  (a) => {
    if (!a) return
    if (!draft.value) {
      loadFrom(a)
      snapshotAtBase.value = snapshot(a)
      return
    }
    // Someone (or our own save) moved the article on. Untouched: follow it.
    if (a.version !== baseVersion.value && !dirty.value) {
      loadFrom(a)
      snapshotAtBase.value = snapshot(a)
    }
  },
  { immediate: true },
)
const remoteNewer = computed(
  () =>
    !!article.value &&
    baseVersion.value != null &&
    article.value.version > baseVersion.value &&
    dirty.value,
)
function takeTheirs() {
  loadFrom(article.value)
  snapshotAtBase.value = snapshot(article.value)
}
const { allowLeave } = useUnsavedChangesGuard(dirty)

// ── Save / publish ───────────────────────────────────────────────────────────
const saving = ref(false)
async function save({ publish = false } = {}) {
  if (!draft.value || saving.value) return
  if (!draft.value.title.trim()) return toast.error('Give the article a title')
  saving.value = true
  try {
    const body = {
      ...draft.value,
      summary: draft.value.summary || null,
      slug: draft.value.slug || null,
      baseVersion: baseVersion.value,
      ...(publish ? { publish: true } : {}),
    }
    const res = await put(`/v1/services/kb/articles/${props.articleId}`, body)
    loadFrom(res.article)
    snapshotAtBase.value = snapshot(res.article)
    toast.success(publish ? 'Published' : 'Saved')
  } catch (e) {
    if (e.status === 409 || e.statusCode === 409)
      toast.error(
        'Someone saved this article while you were editing. Your text is still here; see the banner.',
      )
    else toast.error(e.message || 'The article could not be saved')
  } finally {
    saving.value = false
  }
}
async function publish() {
  if (dirty.value) return save({ publish: true })
  try {
    await post(`/v1/services/kb/articles/${props.articleId}/publish`, {})
    toast.success(
      article.value?.audience === 'AGENTS'
        ? 'Published for agents'
        : 'Published to the help center',
    )
  } catch (e) {
    toast.error(e.message || 'The article could not be published')
  }
}
async function unpublish(archive = false) {
  const ok = await confirm({
    title: archive ? 'Archive this article?' : 'Unpublish this article?',
    message: archive
      ? 'It leaves the help center and the article list. Its versions are kept; you can publish it again.'
      : 'It leaves the help center now. Its versions are kept; you can publish it again.',
    okLabel: archive ? 'Archive' : 'Unpublish',
  })
  if (!ok) return
  try {
    await post(
      `/v1/services/kb/articles/${props.articleId}/${archive ? 'archive' : 'unpublish'}`,
      {},
    )
    toast.success(archive ? 'Archived' : 'Unpublished')
  } catch (e) {
    toast.error(e.message || 'That did not work')
  }
}
async function remove() {
  const ok = await confirm({
    title: `Delete “${article.value?.title}”?`,
    message: 'The article and its history are removed.',
    okLabel: 'Delete',
  })
  if (!ok) return
  try {
    await del(`/v1/services/kb/articles/${props.articleId}`)
    allowLeave()
    router.push(getCompanyPath(`/desk/kb?kb=${article.value?.kbId || ''}`))
  } catch (e) {
    toast.error(e.message || 'The article could not be deleted')
  }
}
useEventListener(window, 'keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (canEdit.value) save()
  }
})

// ── History ──────────────────────────────────────────────────────────────────
const historyOpen = ref(false)
function onRestored(a) {
  loadFrom(a)
  snapshotAtBase.value = snapshot(a)
}

// ── Additional information ───────────────────────────────────────────────────
const languageName = computed(() => {
  const code = article.value?.locale || 'en'
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code
  } catch {
    return code
  }
})
function sourceLabel(s) {
  return s === 'API' ? 'API (e.g. Claude)' : s === 'IMPORT' ? 'Import' : 'Desk'
}

const menuItems = computed(() => [
  { name: 'Version history', icon: IconHistory, click: () => (historyOpen.value = true) },
  ...(canPublish.value && article.value?.status === 'PUBLISHED'
    ? [{ name: 'Unpublish', icon: IconWorldOff, click: () => unpublish(false) }]
    : []),
  ...(canPublish.value && article.value?.status !== 'ARCHIVED'
    ? [{ name: 'Archive', icon: IconArchive, click: () => unpublish(true) }]
    : []),
  ...(canDelete.value ? [{ name: 'Delete', icon: IconTrash, click: remove }] : []),
])
const publishLabel = computed(() => {
  const a = article.value
  if (!a) return 'Publish'
  if (a.status === 'PUBLISHED' && !dirty.value && !a.hasUnpublishedChanges) return 'Published'
  return a.status === 'PUBLISHED' ? 'Publish changes' : 'Publish'
})
const publishDisabled = computed(() => {
  const a = article.value
  return !a || (a.status === 'PUBLISHED' && !dirty.value && !a.hasUnpublishedChanges)
})
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
        aria-label="Back to the knowledge base"
        @click="router.push(getCompanyPath(`/desk/kb${article ? `?kb=${article.kbId}` : ''}`))"
      >
        <IconArrowLeft :size="18" />
      </button>
      <BaseHeading :level="1" class="tw:min-w-0 tw:truncate tw:text-sm tw:font-semibold">{{
        draft?.title || 'Article'
      }}</BaseHeading>
      <template v-if="article">
        <KbStatusBadge :status="article.status" :pendingChanges="article.hasUnpublishedChanges" />
        <button
          type="button"
          class="tw:rounded tw:px-1 tw:text-xs tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main"
          title="Version history"
          @click="historyOpen = true"
        >
          v{{ article.version
          }}<template v-if="article.publishedVersion">
            · live v{{ article.publishedVersion }}</template
          >
        </button>
        <span v-if="dirty" class="tw:text-xs tw:font-medium tw:text-amber-700"
          >Unsaved changes</span
        >
      </template>
      <div class="tw:flex-1" />
      <template v-if="article && canEdit">
        <BaseButton variant="outline" :isLoading="saving" :disabled="!dirty" @click="save()"
          >Save</BaseButton
        >
        <BaseButton v-if="canPublish" :disabled="publishDisabled" @click="publish">
          <IconWorldUpload :size="16" class="tw:mr-1" /> {{ publishLabel }}
        </BaseButton>
      </template>
      <BaseMenu v-if="article" :items="menuItems" flip />
    </header>

    <div
      v-if="remoteNewer"
      class="tw:flex tw:items-center tw:gap-3 tw:border-b tw:border-amber-200 tw:bg-amber-50 tw:px-4 tw:py-2 tw:text-sm tw:text-amber-900"
      role="alert"
    >
      <IconAlertTriangle :size="16" />
      <span class="tw:flex-1"
        >Someone saved version {{ article.version }} while you were editing. Saving now would be
        refused.</span
      >
      <BaseButton size="sm" variant="outline" @click="takeTheirs">Load their version</BaseButton>
    </div>

    <div v-if="article === undefined" class="tw:flex tw:flex-1 tw:items-center tw:justify-center">
      <BaseSpinner />
    </div>
    <BaseEmptyState
      v-else-if="!article"
      class="tw:mt-16"
      title="Article not found"
      description="It may have been deleted."
    />

    <div v-else-if="draft" class="tw:flex tw:min-h-0 tw:flex-1">
      <!-- Writing -->
      <main class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:bg-card">
        <div class="tw:mx-auto tw:w-full tw:max-w-[52rem] tw:px-8 tw:pt-6">
          <input
            v-model="draft.title"
            :readonly="!canEdit"
            aria-label="Title"
            placeholder="Article title"
            class="kb-title-input tw:w-full tw:bg-transparent tw:text-3xl tw:font-semibold tw:outline-none"
            maxlength="255"
          />
          <input
            v-model="draft.summary"
            :readonly="!canEdit"
            aria-label="Summary"
            placeholder="A one-line summary, shown in lists and search results"
            class="kb-title-input tw:mt-2 tw:w-full tw:bg-transparent tw:text-base tw:text-secondary tw:outline-none"
            maxlength="500"
          />
        </div>
        <KbEditor
          v-model="draft.bodyMd"
          :kbId="article.kbId"
          :articleId="article.id"
          :editable="canEdit"
        />
      </main>

      <!-- Settings -->
      <aside
        class="tw:flex tw:w-80 tw:shrink-0 tw:flex-col tw:gap-5 tw:overflow-y-auto tw:border-l tw:border-divider tw:bg-main tw:p-4"
        aria-label="Article settings"
      >
        <div>
          <p class="tw:mb-1 tw:text-sm tw:font-medium">Who sees it</p>
          <SegmentedControl
            v-model="draft.audience"
            :options="[
              { value: 'PUBLIC', label: 'Public' },
              { value: 'AGENTS', label: 'Agents only' },
            ]"
            :readonly="!canEdit"
            ariaLabel="Who sees it"
          />
          <p class="tw:mt-1 tw:text-xs tw:text-secondary">
            {{
              draft.audience === 'AGENTS'
                ? 'Internal: only agents, in the desk. Never on the help center.'
                : 'On the public help center, once published.'
            }}
          </p>
        </div>
        <div>
          <p class="tw:mb-1 tw:text-sm tw:font-medium">Folder</p>
          <BaseSelect
            v-model="draft.collectionId"
            :options="collectionOptions"
            :readonly="!canEdit"
            aria-label="Folder"
          />
        </div>
        <div>
          <p class="tw:mb-1 tw:text-sm tw:font-medium">Tags</p>
          <BaseTagsInput
            v-model="draft.tags"
            :disabled="!canEdit"
            :max="20"
            placeholder="Add a tag…"
          />
        </div>
        <div>
          <BaseTextInput
            v-model="draft.slug"
            label="Address"
            :disabled="!canEdit"
            placeholder="reset-your-password"
          />
          <p class="tw:mt-1 tw:text-xs tw:text-secondary">
            /articles/{{ draft.slug || '…'
            }}<template v-if="article.publishedVersion && draft.slug !== snapshotAtBase?.slug">
              · the old address will redirect here</template
            >
          </p>
        </div>
        <div>
          <p class="tw:mb-1 tw:text-sm tw:font-medium">Written by</p>
          <UserSelectMenu
            v-model="draft.writtenById"
            :disabled="!canEdit"
            nullLabel="— The author —"
            aria-label="Written by"
          />
          <p class="tw:mt-1 tw:text-xs tw:text-secondary">
            Shown on the help center. Changing it makes no new version.
          </p>
        </div>

        <section
          class="tw:flex tw:flex-col tw:gap-2 tw:border-t tw:border-divider tw:pt-4"
          aria-labelledby="kb-additional"
        >
          <p id="kb-additional" class="tw:text-sm tw:font-semibold">Additional information</p>
          <dl class="tw:grid tw:grid-cols-[7.5rem_1fr] tw:gap-x-3 tw:gap-y-2 tw:text-sm">
            <dt class="tw:text-secondary">Type</dt>
            <dd>{{ article.audience === 'AGENTS' ? 'Internal article' : 'Public article' }}</dd>
            <dt class="tw:text-secondary">Status</dt>
            <dd>
              <KbStatusBadge
                :status="article.status"
                :pendingChanges="article.hasUnpublishedChanges"
              />
            </dd>
            <dt class="tw:text-secondary">Article ID</dt>
            <dd>{{ article.number || '—' }}</dd>
            <dt class="tw:text-secondary">Language</dt>
            <dd>{{ languageName }}</dd>
            <dt class="tw:text-secondary">Created</dt>
            <dd>{{ article.createdAt?.formatDate('datetime') }}</dd>
            <dt class="tw:text-secondary">Created by</dt>
            <dd>
              <UserBadgeById v-if="article.authorId" :userId="article.authorId" />
              <span v-else>{{ sourceLabel(article.source) }}</span>
            </dd>
            <dt class="tw:text-secondary">Written by</dt>
            <dd>
              <UserBadgeById
                v-if="article.writtenById || article.authorId"
                :userId="article.writtenById || article.authorId"
              />
              <span v-else>—</span>
            </dd>
            <dt class="tw:text-secondary">Last updated</dt>
            <dd>{{ article.updatedAt?.formatDate('datetime') }}</dd>
            <dt class="tw:text-secondary">Last updated by</dt>
            <dd>
              <UserBadgeById v-if="article.updatedBy" :userId="article.updatedBy" />
              <span v-else>{{ sourceLabel(article.source) }}</span>
            </dd>
            <dt class="tw:text-secondary">Version</dt>
            <dd>
              <button
                type="button"
                class="tw:text-primary tw:underline tw:underline-offset-2"
                @click="historyOpen = true"
              >
                v{{ article.version }}
              </button>
              <span class="tw:text-secondary">
                ·
                {{
                  article.publishedVersion ? `live v${article.publishedVersion}` : 'not published'
                }}</span
              >
            </dd>
            <template v-if="article.publishedAt">
              <dt class="tw:text-secondary">Published</dt>
              <dd>{{ article.publishedAt.formatDate('datetime') }}</dd>
            </template>
            <dt class="tw:text-secondary">Source</dt>
            <dd>{{ sourceLabel(article.source) }}</dd>
            <template v-if="article.externalKey">
              <dt class="tw:text-secondary">External key</dt>
              <dd class="tw:truncate" :title="article.externalKey">{{ article.externalKey }}</dd>
            </template>
          </dl>
        </section>
      </aside>
    </div>

    <KbHistoryDialog
      v-if="article"
      v-model="historyOpen"
      :articleId="article.id"
      :kbId="article.kbId"
      :dirty="dirty"
      @restored="onRestored"
    />
  </div>
</template>
