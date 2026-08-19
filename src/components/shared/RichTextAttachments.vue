<script setup>
/**
 * RichTextAttachments — BaseRichTextEditor combined with a file/document
 * attachment list, presented as ONE control.
 *
 * Two storage models, same UI:
 *
 *   default (single field) — everything encoded into one string:
 *     "<tiptap html>\n[qms-attachments]::[{assetId,name,mimeType}|{documentId,name}]"
 *     The marker is stripped before the HTML reaches Tiptap, so the editor is
 *     never aware of it. Used where the caller has one text column to spend
 *     (QC test methods).
 *
 *   separateAttachments — body in v-model, files in v-model:attachments, each
 *     persisted to its own column, and the attachments are whole asset objects
 *     rather than this component's reduced shape. Used by document sections,
 *     whose attachments column is read by submit-gating and by the controlled
 *     PDF renderer. See the prop for the full reasoning.
 *
 * Inline images are handled by Tiptap's AdvancedImage extension natively; the
 * attachment list below is for non-image files (PDFs, docs) and links to
 * existing documents in the system.
 *
 * Edit mode     — BaseRichTextEditor + attachment chips with ×-remove +
 *                 "Attach file" / "Link document".
 * Readonly mode — the HTML plus attachment links. Rendered through the editor
 *                 when sectionNumber is set (heading numbering lives in its
 *                 styles), otherwise a light v-html.
 *
 * Usage:
 *   <RichTextAttachments v-model="char.testMethod" :readonly="!canEdit" />
 *   <RichTextAttachments
 *     v-model="section.content"
 *     v-model:attachments="section.attachments"
 *     :separateAttachments="true"
 *     :sectionNumber="index + 1"
 *   />
 */
import { IconPaperclip, IconX, IconUpload, IconFileText } from '@tabler/icons-vue'
import { upload } from '@/api' // multipart POST — see CLAUDE.md rule #4 exception.
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  readonly: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Type instructions, paste or drag images…' },
  /**
   * Keep attachments in their OWN model instead of encoding them into the
   * string (2026-08-16).
   *
   * Document sections need this. They store body and files in two columns
   * (document_sections.content TEXT, .attachments JSONB), and both are read
   * elsewhere: sectionIsIncomplete() gates submit on attachments being
   * present, and snapshotPrint.renderAttachmentList() prints them into the
   * controlled PDF. Folding them into `content` would empty that column,
   * permanently block submit on every textAttachment section, and drop the
   * attachment list from the archived artifact — while leaking the
   * [qms-attachments] marker into the printed body.
   *
   * So the component is shared, the encoding is not. Default off, so the
   * single-string callers (QC test methods, etc.) are untouched.
   */
  separateAttachments: { type: Boolean, default: false },
  /**
   * Forwarded to BaseRichTextEditor, which uses it for QMS hierarchical
   * heading numbering (1.1, 1.2, …). Document sections pass it; without it a
   * textAttachment section would lose the numbering every other section has.
   * When set, the readonly view renders through the editor too rather than
   * the plain v-html, so the numbering survives read mode and print.
   */
  sectionNumber: { type: Number, default: null },
})

const modelValue = defineModel({ type: String, default: '' })
// Only used when separateAttachments — the asset objects BaseUploader and the
// print renderer already speak, not this component's {assetId,name} shape.
const attachmentsModel = defineModel('attachments', { type: Array, default: () => [] })
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
  // In separate mode the string carries the body only; the marker would be
  // printed as text by anything rendering `content` directly.
  if (props.separateAttachments || !attachments.length) return normalized
  return `${normalized}${MARKER}${JSON.stringify(attachments)}`
}

// ── Draft state ───────────────────────────────────────────────────────────────
const { html: initHtml, attachments: initAtts } = parse(modelValue.value)
const draftHtml = ref(initHtml)

/**
 * In separate mode the attachments live in their own model. But records written
 * BEFORE a field moved to separate mode have them encoded in the string, and
 * separate mode's serialize() drops the marker — so reading one, then saving,
 * would silently discard its attachments.
 *
 * So: prefer the separate model, and fall back to whatever the string carries
 * when it is empty. The next save rewrites the record in the new shape. Delete
 * this once no marker-format rows remain.
 */
function initialAttachments() {
  if (!props.separateAttachments) return [...initAtts]
  const separate = attachmentsModel.value ?? []
  return separate.length ? [...separate] : [...initAtts]
}

const draftAtts = ref(initialAttachments())

// Guard: when we emit, suppress the echo back into draftHtml.
let _emitting = false

watch(modelValue, (v) => {
  if (_emitting) return
  const p = parse(v)
  draftHtml.value = p.html
  if (!props.separateAttachments) {
    draftAtts.value = [...p.attachments]
  } else if (!draftAtts.value.length && p.attachments.length) {
    // Same legacy rescue as initialAttachments, for a value that arrives late.
    draftAtts.value = [...p.attachments]
  }
})

watch(attachmentsModel, (v) => {
  if (_emitting || !props.separateAttachments) return
  draftAtts.value = [...(v ?? [])]
})

function pushUpdate() {
  _emitting = true
  modelValue.value = serialize(draftHtml.value, draftAtts.value)
  if (props.separateAttachments) attachmentsModel.value = [...draftAtts.value]
  nextTick(() => {
    _emitting = false
  })
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
    // Separate mode stores the ASSET as-is, because the readers of that column
    // already speak that shape: snapshotPrint reads a.filename, BaseUploader
    // round-trips it. Reducing it to {assetId,name} here would silently break
    // the controlled PDF's attachment list.
    draftAtts.value = [
      ...draftAtts.value,
      props.separateAttachments
        ? asset
        : {
            assetId: asset.id,
            name: asset.originalFilename || file.name,
            mimeType: asset.mimeType,
          },
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

const pickedDoc = useLiveQueryWithDeps([() => pickedDocId.value], async (db, [id]) =>
  id ? db.Document.findByPk(id) : null,
)

watch(pickedDoc, (doc) => {
  if (!doc) return
  const label = `${doc.docNumber} – ${doc.title}`
  draftAtts.value = [
    ...draftAtts.value,
    {
      documentId: doc.id,
      name: label,
      // Mirrored so the print renderer, which reads filename/originalFilename,
      // names a linked document instead of falling back to "attachment".
      ...(props.separateAttachments ? { filename: label } : {}),
      mimeType: 'application/qms-document',
    },
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
const assetIds = computed(() => draftAtts.value.map((a) => a.assetId ?? a.id).filter(Boolean))
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
const readonlyParsed = computed(() => {
  const parsed = parse(modelValue.value)
  // In separate mode the string is body-only; the files live in their own model.
  return props.separateAttachments
    ? { html: parsed.html, attachments: attachmentsModel.value ?? [] }
    : parsed
})

const readonlyAssetIds = computed(() =>
  readonlyParsed.value.attachments.map((a) => a.assetId ?? a.id).filter(Boolean),
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

// Both shapes flow through here: the encoded {assetId,name} form and, in
// separate mode, a whole asset row ({id, url, filename, originalFilename}).
function attHref(att, assetsMap) {
  if (att.assetId) return assetsMap[att.assetId]?.url ?? null
  if (att.documentId) return getCompanyPath(`/documents/${att.documentId}`)
  return att.url ?? (att.id ? (assetsMap[att.id]?.url ?? null) : null)
}

function attName(att) {
  return att.name ?? att.originalFilename ?? att.filename ?? 'attachment'
}

function isImage(att) {
  return att.mimeType?.startsWith('image/')
}
</script>

<template>
  <!-- ── READONLY ──────────────────────────────────────────────────────────── -->
  <div v-if="readonly" class="tw:flex tw:flex-col tw:gap-1.5">
    <!-- With a sectionNumber the heading numbering lives in the editor's own
         styles, so read mode has to go through it too or a section renders
         unnumbered on screen and in print. -->
    <BaseRichTextEditor
      v-if="sectionNumber != null"
      :modelValue="readonlyParsed.html"
      contentType="html"
      :editable="false"
      :sectionNumber="sectionNumber"
      class="tw:border-0! tw:min-h-fit!"
    />
    <!-- Render Tiptap HTML; content comes from authenticated users in-tenant. -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div
      v-else-if="readonlyParsed.html && readonlyParsed.html !== '<p></p>'"
      class="rich-text-readonly tw:text-sm tw:text-on-main"
      v-html="readonlyParsed.html"
    />
    <div v-if="readonlyParsed.attachments.length" class="tw:flex tw:flex-wrap tw:gap-2">
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
        {{ attName(att) }}
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
      :sectionNumber="sectionNumber"
    >
      <!-- Forward the toolbar seam so callers (e.g. DynamicForm's default AI
           assist) can extend the inner editor's toolbar. -->
      <template v-if="$slots['toolbar-extra']" #toolbar-extra="scope">
        <slot name="toolbar-extra" v-bind="scope" />
      </template>
    </BaseRichTextEditor>

    <!-- Non-image file attachment chips -->
    <div v-if="draftAtts.length || uploading" class="tw:flex tw:flex-wrap tw:gap-1.5">
      <div
        v-for="(att, i) in draftAtts"
        :key="i"
        class="tw:relative tw:group tw:inline-flex tw:items-center tw:gap-1.5 tw:pl-2 tw:pr-6 tw:py-1 tw:rounded tw:border tw:border-divider tw:bg-main-hover tw:text-xs"
      >
        <img
          v-if="isImage(att) && attHref(att, assetsById)"
          :src="attHref(att, assetsById)"
          :alt="attName(att)"
          class="tw:size-5 tw:rounded tw:object-cover"
        />
        <IconFileText v-else-if="att.documentId" :size="13" class="tw:text-primary tw:shrink-0" />
        <IconPaperclip v-else :size="13" class="tw:text-secondary tw:shrink-0" />
        <span class="tw:max-w-36 tw:truncate tw:text-on-main" :title="attName(att)">
          {{ attName(att) }}
        </span>
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
      <DocumentSelectMenu v-model="pickedDocId" class="tw:w-72" :required="false" />
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
.rich-text-readonly :deep(p) {
  margin: 0 0 0.4em;
}
.rich-text-readonly :deep(p:last-child) {
  margin-bottom: 0;
}
.rich-text-readonly :deep(strong) {
  font-weight: 600;
}
.rich-text-readonly :deep(em) {
  font-style: italic;
}
.rich-text-readonly :deep(ul) {
  padding-left: 1.25rem;
  list-style: disc;
}
.rich-text-readonly :deep(ol) {
  padding-left: 1.25rem;
  list-style: decimal;
}
.rich-text-readonly :deep(li) {
  margin: 0.15em 0;
}
.rich-text-readonly :deep(a) {
  color: var(--color-primary);
  text-decoration: underline;
}
.rich-text-readonly :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}
.rich-text-readonly :deep(code) {
  background: var(--color-sidebar);
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-size: 0.85em;
}
</style>
