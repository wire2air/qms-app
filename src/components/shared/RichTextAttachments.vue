<script setup>
/**
 * RichTextAttachments — BaseRichTextEditor combined with a file/document
 * attachment list, all encoded in a single string field.
 *
 * Encoding:
 *   "<tiptap html>\n[qms-attachments]::[{assetId,name,mimeType}|{documentId,name}]"
 *
 * The marker is stripped before the HTML reaches Tiptap, so the editor is
 * never aware of it. Inline images are handled by Tiptap's AdvancedImage
 * extension natively; the attachment list below is for non-image files
 * (PDFs, docs) and links to existing documents in the system.
 *
 * Edit mode   — BaseRichTextEditor (bold, italic, images, links, etc.) +
 *               attachment chips with ×-remove + "Attach file" / "Link document".
 * Readonly mode — v-html render of the HTML part + attachment links below.
 *
 * Usage:
 *   <RichTextAttachments v-model="char.testMethod" :readonly="!canEdit" />
 */
import { IconPaperclip, IconX, IconUpload, IconFileText } from '@tabler/icons-vue'
import { upload } from '@/api' // multipart POST — see CLAUDE.md rule #4 exception.
import { getCompanyPath } from '@/utils/routeHelpers.js'

defineProps({
  readonly: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Type instructions, paste or drag images…' },
})

const modelValue = defineModel({ type: String, default: '' })
const toast = useToast()

// ── Encoding ──────────────────────────────────────────────────────────────────
const MARKER = '\n[qms-attachments]::'

function parse(raw) {
  const s = raw || ''
  const idx = s.indexOf(MARKER)
  if (idx === -1) return { html: s, attachments: [] }
  try {
    return { html: s.slice(0, idx), attachments: JSON.parse(s.slice(idx + MARKER.length)) }
  } catch {
    return { html: s, attachments: [] }
  }
}

// Tiptap emits trailing (and sometimes leading) empty paragraphs — "real
// text<p></p><p></p>". Strip empty paragraphs at both edges so we never
// persist a stray "<p></p>", and collapse an all-blank value to '' so
// `required` validation works. Interior empty paragraphs (deliberate spacing)
// are left untouched.
const EMPTY_P_LEADING = /^(?:\s*<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+/i
const EMPTY_P_TRAILING = /(?:\s*<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/i

function normalizeHtml(html) {
  const trimmed = (html || '').replace(EMPTY_P_LEADING, '').replace(EMPTY_P_TRAILING, '')
  const stripped = trimmed
    .replace(/<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, '')
    .trim()
  return stripped ? trimmed : ''
}

function serialize(html, attachments) {
  const normalized = normalizeHtml(html)
  if (!attachments.length) return normalized
  return `${normalized}${MARKER}${JSON.stringify(attachments)}`
}

// ── Draft state ───────────────────────────────────────────────────────────────
const { html: initHtml, attachments: initAtts } = parse(modelValue.value)
const draftHtml = ref(initHtml)
const draftAtts = ref([...initAtts])

// Guard: when we emit, suppress the echo back into draftHtml.
let _emitting = false

watch(modelValue, (v) => {
  if (_emitting) return
  const p = parse(v)
  draftHtml.value = p.html
  draftAtts.value = [...p.attachments]
})

function pushUpdate() {
  _emitting = true
  modelValue.value = serialize(draftHtml.value, draftAtts.value)
  nextTick(() => { _emitting = false })
}

// BaseRichTextEditor emits via v-model → draftHtml changes → push to parent.
watch(draftHtml, pushUpdate)

// ── File upload (PDFs, docs — non-image files not handled inline by Tiptap) ──
const fileInputRef = ref(null)
const uploading = ref(false)

function pickFile() {
  fileInputRef.value?.click()
}

async function onFileSelected(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('fileType', 'ASSET')
    const { asset } = await upload('/v1/files/upload', form)
    draftAtts.value = [
      ...draftAtts.value,
      { assetId: asset.id, name: asset.originalFilename || file.name, mimeType: asset.mimeType },
    ]
    pushUpdate()
  } catch (err) {
    toast.error(err?.message || 'Upload failed')
  } finally {
    uploading.value = false
  }
}

// ── Document linking ──────────────────────────────────────────────────────────
const showDocPicker = ref(false)
const pickedDocId = ref(null)

const pickedDoc = useLiveQueryWithDeps(
  [() => pickedDocId.value],
  async (db, [id]) => (id ? db.Document.findByPk(id) : null),
)

watch(pickedDoc, (doc) => {
  if (!doc) return
  draftAtts.value = [
    ...draftAtts.value,
    { documentId: doc.id, name: `${doc.docNumber} – ${doc.title}`, mimeType: 'application/qms-document' },
  ]
  pushUpdate()
  pickedDocId.value = null
  showDocPicker.value = false
})

// ── Remove attachment ─────────────────────────────────────────────────────────
function removeAtt(idx) {
  draftAtts.value = draftAtts.value.filter((_, i) => i !== idx)
  pushUpdate()
}

// ── Asset URL resolution for thumbnail preview of image attachments ───────────
const assetIds = computed(() =>
  draftAtts.value.filter((a) => a.assetId).map((a) => a.assetId),
)
const assetsById = useLiveQueryWithDeps(
  [() => assetIds.value.join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return {}
    const assets = await Promise.all(idsStr.split(',').map((id) => db.Asset.findByPk(id)))
    const m = {}
    for (const a of assets) if (a) m[a.id] = a
    return m
  },
  { initial: {} },
)

// Readonly attachment resolution uses parsed value directly.
const readonlyParsed = computed(() => parse(modelValue.value))

const readonlyAssetIds = computed(() =>
  readonlyParsed.value.attachments.filter((a) => a.assetId).map((a) => a.assetId),
)
const readonlyAssetsById = useLiveQueryWithDeps(
  [() => readonlyAssetIds.value.join(',')],
  async (db, [idsStr]) => {
    if (!idsStr) return {}
    const assets = await Promise.all(idsStr.split(',').map((id) => db.Asset.findByPk(id)))
    const m = {}
    for (const a of assets) if (a) m[a.id] = a
    return m
  },
  { initial: {} },
)

function attHref(att, assetsMap) {
  if (att.assetId) return assetsMap[att.assetId]?.url ?? null
  if (att.documentId) return getCompanyPath(`/documents/${att.documentId}`)
  return null
}

function isImage(att) {
  return att.mimeType?.startsWith('image/')
}
</script>

<template>
  <!-- ── READONLY ──────────────────────────────────────────────────────────── -->
  <div v-if="readonly" class="tw:flex tw:flex-col tw:gap-1.5">
    <!-- Render Tiptap HTML; content comes from authenticated users in-tenant. -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div
      v-if="readonlyParsed.html && readonlyParsed.html !== '<p></p>'"
      class="rich-text-readonly tw:text-sm tw:text-on-main"
      v-html="readonlyParsed.html"
    />
    <div
      v-if="readonlyParsed.attachments.length"
      class="tw:flex tw:flex-wrap tw:gap-2"
    >
      <a
        v-for="(att, i) in readonlyParsed.attachments"
        :key="i"
        :href="attHref(att, readonlyAssetsById)"
        target="_blank"
        rel="noopener"
        class="tw:inline-flex tw:items-center tw:gap-1.5 tw:text-xs tw:text-primary tw:underline tw:hover:opacity-75"
      >
        <img
          v-if="isImage(att) && attHref(att, readonlyAssetsById)"
          :src="attHref(att, readonlyAssetsById)"
          :alt="att.name"
          class="tw:size-7 tw:rounded tw:object-cover tw:border tw:border-divider tw:no-underline"
        />
        <IconFileText v-else-if="att.documentId" :size="13" />
        <IconPaperclip v-else :size="13" />
        {{ att.name }}
      </a>
    </div>
  </div>

  <!-- ── EDIT ─────────────────────────────────────────────────────────────── -->
  <div v-else class="tw:flex tw:flex-col tw:gap-2">
    <BaseRichTextEditor
      v-model="draftHtml"
      contentType="html"
      :editable="true"
      :placeholder="placeholder"
    />

    <!-- Non-image file attachment chips -->
    <div v-if="draftAtts.length || uploading" class="tw:flex tw:flex-wrap tw:gap-1.5">
      <div
        v-for="(att, i) in draftAtts"
        :key="i"
        class="tw:relative tw:group tw:inline-flex tw:items-center tw:gap-1.5 tw:pl-2 tw:pr-6 tw:py-1 tw:rounded tw:border tw:border-divider tw:bg-main-hover tw:text-xs"
      >
        <img
          v-if="isImage(att) && assetsById[att.assetId]?.url"
          :src="assetsById[att.assetId].url"
          :alt="att.name"
          class="tw:size-5 tw:rounded tw:object-cover"
        />
        <IconFileText v-else-if="att.documentId" :size="13" class="tw:text-primary tw:shrink-0" />
        <IconPaperclip v-else :size="13" class="tw:text-secondary tw:shrink-0" />
        <span class="tw:max-w-36 tw:truncate tw:text-on-main" :title="att.name">{{ att.name }}</span>
        <button
          type="button"
          class="tw:absolute tw:right-1 tw:top-1/2 tw:-translate-y-1/2 tw:size-4 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:text-secondary tw:hover:text-bad tw:bg-transparent tw:border-0 tw:cursor-pointer"
          title="Remove"
          @click="removeAtt(i)"
        >
          <IconX :size="10" />
        </button>
      </div>
      <span v-if="uploading" class="tw:text-xs tw:text-secondary tw:self-center tw:animate-pulse">
        Uploading…
      </span>
    </div>

    <!-- Attach file / Link document -->
    <div class="tw:flex tw:items-center tw:gap-3 tw:flex-wrap">
      <button
        type="button"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0"
        :disabled="uploading"
        @click="pickFile"
      >
        <IconUpload :size="13" /> Attach file
      </button>
      <button
        type="button"
        class="tw:inline-flex tw:items-center tw:gap-1 tw:text-xs tw:text-secondary tw:hover:text-primary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0"
        @click="showDocPicker = !showDocPicker"
      >
        <IconFileText :size="13" /> Link document
      </button>
    </div>

    <!-- Inline document picker -->
    <div v-if="showDocPicker">
      <DocumentSelectMenu
        v-model="pickedDocId"
        class="tw:w-72"
        :required="false"
      />
    </div>

    <input
      ref="fileInputRef"
      type="file"
      accept=".pdf,.doc,.docx,.xls,.xlsx,.csv"
      class="tw:hidden"
      @change="onFileSelected"
    />
  </div>
</template>

<style scoped>
/* Minimal prose styles for the readonly v-html render — mirrors what Tiptap
   applies inside the editor so bold/italic/lists look consistent. */
.rich-text-readonly :deep(p) { margin: 0 0 0.4em; }
.rich-text-readonly :deep(p:last-child) { margin-bottom: 0; }
.rich-text-readonly :deep(strong) { font-weight: 600; }
.rich-text-readonly :deep(em) { font-style: italic; }
.rich-text-readonly :deep(ul) { padding-left: 1.25rem; list-style: disc; }
.rich-text-readonly :deep(ol) { padding-left: 1.25rem; list-style: decimal; }
.rich-text-readonly :deep(li) { margin: 0.15em 0; }
.rich-text-readonly :deep(a) { color: var(--color-primary); text-decoration: underline; }
.rich-text-readonly :deep(img) { max-width: 100%; border-radius: 4px; }
.rich-text-readonly :deep(code) { background: var(--color-sidebar); padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.85em; }
</style>
