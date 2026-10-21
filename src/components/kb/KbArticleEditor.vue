<script setup>
import {
  IconArrowLeft,
  IconPhoto,
  IconHistory,
  IconWorldUpload,
  IconWorldOff,
  IconArchive,
  IconTrash,
  IconRestore,
  IconEye,
  IconPencil,
  IconLayoutColumns,
  IconAlertTriangle,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: an article
// save writes a numbered version, renders it and may write a redirect.
import { get, post, put, del, upload } from '@/api'
import { isAllowed } from '@/utils/currentSession.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useUnsavedChangesGuard } from '@shared/composables/useUnsavedChangesGuard.js'
import { kbPreviewMarkdown } from './kbMarkdown.js'

/**
 * ONE KNOWLEDGE BASE ARTICLE (backend services/kbArticleService.js).
 *
 * The article row (synced) is the CURRENT draft; this editor holds a local
 * copy, and Save sends it with the version it was made from. If someone
 * else saved meanwhile, the server refuses (409) and the banner offers their
 * version — nobody's work is overwritten. Publishing makes a version live;
 * later saves stay drafts until published again ("Changes not published").
 *
 * Images are uploaded to this knowledge base (the Support Desk's own storage)
 * and referenced as `kb-asset:<id>`; the preview shows them through the desk's
 * image route.
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
  { value: null, label: '— No collection —' },
  ...[...collections.value]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((c) => ({ value: c.id, label: c.title })),
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

// ── Images ───────────────────────────────────────────────────────────────────
const bodyEl = ref(null)
const fileEl = ref(null)
const uploading = ref(false)
function insertAtCursor(text) {
  const el = bodyEl.value
  const md = draft.value.bodyMd
  const start = el ? el.selectionStart : md.length
  const end = el ? el.selectionEnd : md.length
  const before = md.slice(0, start)
  const pad = before && !before.endsWith('\n') ? '\n\n' : ''
  draft.value.bodyMd = `${before}${pad}${text}\n${md.slice(end)}`
  nextTick(() => {
    if (!el) return
    const pos = start + pad.length + text.length + 1
    el.focus()
    el.setSelectionRange(pos, pos)
  })
}
async function onImagePicked(e) {
  const files = [...(e.target.files || [])]
  e.target.value = ''
  if (!files.length || !article.value) return
  uploading.value = true
  try {
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      const res = await upload(`/v1/services/kb/bases/${article.value.kbId}/assets`, fd)
      insertAtCursor(res.markdown)
    }
  } catch (err) {
    toast.error(err.message || 'The image could not be uploaded')
  } finally {
    uploading.value = false
  }
}

// ── View mode ────────────────────────────────────────────────────────────────
const mode = ref('split')
const previewMd = computed(() => kbPreviewMarkdown(draft.value?.bodyMd))

// ── History ──────────────────────────────────────────────────────────────────
const historyOpen = ref(false)
const revisions = ref([])
const viewing = ref(null)
async function openHistory() {
  historyOpen.value = true
  viewing.value = null
  try {
    revisions.value = (await get(`/v1/services/kb/articles/${props.articleId}/revisions`)).revisions
  } catch (e) {
    toast.error(e.message || 'The history could not be loaded')
  }
}
async function viewRevision(v) {
  try {
    viewing.value = (
      await get(`/v1/services/kb/articles/${props.articleId}/revisions/${v}`)
    ).revision
  } catch (e) {
    toast.error(e.message || 'That version could not be loaded')
  }
}
async function restore(v) {
  if (dirty.value) {
    const ok = await confirm({
      title: 'Discard your unsaved changes?',
      message: `Restoring version ${v} replaces the text in the editor.`,
      okLabel: 'Restore',
    })
    if (!ok) return
  }
  try {
    const res = await post(`/v1/services/kb/articles/${props.articleId}/restore`, { version: v })
    loadFrom(res.article)
    snapshotAtBase.value = snapshot(res.article)
    historyOpen.value = false
    toast.success(`Version ${v} restored as version ${res.article.version}`)
  } catch (e) {
    toast.error(e.message || 'That version could not be restored')
  }
}
async function publishVersion(v) {
  try {
    await post(`/v1/services/kb/articles/${props.articleId}/publish`, { version: v })
    historyOpen.value = false
    toast.success(`Version ${v} is live`)
  } catch (e) {
    toast.error(e.message || 'That version could not be published')
  }
}

const menuItems = computed(() => [
  { name: 'History', icon: IconHistory, click: openHistory },
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
        <span class="tw:text-xs tw:text-secondary"
          >v{{ article.version
          }}<template v-if="article.publishedVersion">
            · live v{{ article.publishedVersion }}</template
          ></span
        >
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
      <main class="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col">
        <div class="tw:border-b tw:border-divider tw:bg-card tw:px-6 tw:pt-4 tw:pb-2">
          <input
            v-model="draft.title"
            :readonly="!canEdit"
            aria-label="Title"
            placeholder="Article title"
            class="tw:w-full tw:bg-transparent tw:text-2xl tw:font-semibold tw:outline-none"
            maxlength="255"
          />
          <div class="tw:mt-2 tw:flex tw:items-center tw:gap-2">
            <SegmentedControl
              v-model="mode"
              :options="[
                { value: 'write', label: 'Write', icon: IconPencil },
                { value: 'split', label: 'Split', icon: IconLayoutColumns },
                { value: 'preview', label: 'Preview', icon: IconEye },
              ]"
              size="sm"
              :equalWidth="false"
              ariaLabel="View"
            />
            <template v-if="canEdit">
              <input
                ref="fileEl"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                class="tw:hidden"
                @change="onImagePicked"
              />
              <BaseButton
                size="sm"
                variant="outline"
                :isLoading="uploading"
                @click="fileEl?.click()"
              >
                <IconPhoto :size="16" class="tw:mr-1" /> Image
              </BaseButton>
            </template>
            <span class="tw:ml-auto tw:text-xs tw:text-secondary"
              >Markdown · <code>:::tip</code> callouts · Ctrl/⌘+S saves</span
            >
          </div>
        </div>
        <div class="tw:flex tw:min-h-0 tw:flex-1">
          <textarea
            v-if="mode !== 'preview' && canEdit"
            ref="bodyEl"
            v-model="draft.bodyMd"
            aria-label="Article text (Markdown)"
            placeholder="## A heading&#10;&#10;Write the answer. Use “Image” to add screenshots."
            class="tw:min-h-0 tw:flex-1 tw:resize-none tw:border-r tw:border-divider tw:bg-card tw:p-6 tw:text-sm tw:leading-6 tw:outline-none"
            spellcheck="true"
          />
          <div
            v-if="mode !== 'write' || !canEdit"
            class="tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:p-6"
          >
            <BaseMarkdown
              v-if="draft.bodyMd.trim()"
              :content="previewMd"
              allowImages
              class="kb-preview"
            />
            <p v-else class="tw:text-sm tw:text-secondary">Nothing written yet.</p>
          </div>
        </div>
      </main>

      <!-- Settings -->
      <aside
        class="tw:flex tw:w-80 tw:shrink-0 tw:flex-col tw:gap-5 tw:overflow-y-auto tw:border-l tw:border-divider tw:bg-card tw:p-4"
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
                ? 'Only agents, in the desk. Never on the help center.'
                : 'On the public help center, once published.'
            }}
          </p>
        </div>
        <div>
          <p class="tw:mb-1 tw:text-sm tw:font-medium">Collection</p>
          <BaseSelect
            v-model="draft.collectionId"
            :options="collectionOptions"
            :readonly="!canEdit"
            aria-label="Collection"
          />
        </div>
        <BaseTextarea
          v-model="draft.summary"
          label="Summary"
          :rows="3"
          :disabled="!canEdit"
          placeholder="One or two sentences: shown in lists and search results"
          :maxlength="500"
        />
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
          <p class="tw:mb-1 tw:text-sm tw:font-medium">Tags</p>
          <BaseTagsInput
            v-model="draft.tags"
            :disabled="!canEdit"
            :max="20"
            placeholder="Add a tag…"
          />
        </div>
        <dl
          class="tw:grid tw:grid-cols-2 tw:gap-x-3 tw:gap-y-1 tw:border-t tw:border-divider tw:pt-3 tw:text-xs"
        >
          <dt class="tw:text-secondary">Version</dt>
          <dd>v{{ article.version }}</dd>
          <dt class="tw:text-secondary">Live</dt>
          <dd>{{ article.publishedVersion ? `v${article.publishedVersion}` : 'Not published' }}</dd>
          <template v-if="article.publishedAt">
            <dt class="tw:text-secondary">Published</dt>
            <dd>{{ article.publishedAt.formatDate('datetime') }}</dd>
          </template>
          <dt class="tw:text-secondary">Source</dt>
          <dd>
            {{
              article.source === 'API'
                ? 'API (e.g. Claude)'
                : article.source === 'IMPORT'
                  ? 'Import'
                  : 'Desk'
            }}
          </dd>
          <template v-if="article.externalKey">
            <dt class="tw:text-secondary">External key</dt>
            <dd class="tw:truncate" :title="article.externalKey">{{ article.externalKey }}</dd>
          </template>
        </dl>
      </aside>
    </div>

    <BaseDrawer v-model="historyOpen" title="History" side="right">
      <div class="tw:flex tw:flex-col tw:gap-3">
        <ul class="tw:divide-y tw:divide-divider tw:rounded-md tw:border tw:border-divider">
          <li
            v-for="r in revisions"
            :key="r.id"
            class="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:text-sm"
          >
            <button
              class="tw:flex-1 tw:text-left tw:hover:underline"
              @click="viewRevision(r.version)"
            >
              <span class="tw:font-medium">v{{ r.version }}</span>
              <span
                v-if="r.version === article?.publishedVersion"
                class="tw:ml-1 tw:text-xs tw:text-green-700"
                >live</span
              >
              <span class="tw:ml-2 tw:text-xs tw:text-secondary"
                >{{ r.source === 'API' ? 'API' : 'Desk'
                }}<template v-if="r.note"> · {{ r.note }}</template></span
              >
            </button>
          </li>
        </ul>
        <div v-if="viewing" class="tw:rounded-md tw:border tw:border-divider tw:p-3">
          <div class="tw:mb-2 tw:flex tw:items-center tw:gap-2">
            <span class="tw:flex-1 tw:text-sm tw:font-semibold"
              >v{{ viewing.version }} · {{ viewing.title }}</span
            >
            <BaseButton
              v-if="canEdit && viewing.version !== article?.version"
              size="sm"
              variant="outline"
              @click="restore(viewing.version)"
            >
              <IconRestore :size="14" class="tw:mr-1" /> Restore
            </BaseButton>
            <BaseButton
              v-if="canPublish && viewing.version !== article?.publishedVersion"
              size="sm"
              @click="publishVersion(viewing.version)"
              >Publish this</BaseButton
            >
          </div>
          <BaseMarkdown
            :content="kbPreviewMarkdown(viewing.bodyMd)"
            allowImages
            class="kb-preview"
          />
        </div>
      </div>
    </BaseDrawer>
  </div>
</template>

<style scoped>
.kb-preview :deep(.admonition) {
  border-left: 4px solid var(--color-primary, #136dec);
  background: color-mix(in srgb, var(--color-primary, #136dec) 6%, transparent);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  margin: 1rem 0;
}
.kb-preview :deep(.admonition-warning) {
  border-color: #d97706;
  background: #fffbeb;
}
.kb-preview :deep(.admonition-danger) {
  border-color: #dc2626;
  background: #fef2f2;
}
.kb-preview :deep(.admonition-tip) {
  border-color: #16a34a;
  background: #f0fdf4;
}
.kb-preview :deep(.admonition-title) {
  font-weight: 600;
  margin: 0 0 0.25rem;
}
.kb-preview :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}
</style>
