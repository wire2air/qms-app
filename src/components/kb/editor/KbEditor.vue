<script setup>
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import {
  IconBold,
  IconItalic,
  IconStrikethrough,
  IconCode,
  IconLink,
  IconList,
  IconListNumbers,
  IconBlockquote,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconPlus,
  IconChevronDown,
  IconPhoto,
  IconVideo,
  IconTable,
  IconSeparatorHorizontal,
  IconClick,
  IconLayoutBottombarCollapse,
  IconPaperclip,
  IconBraces,
  IconSourceCode,
  IconInfoSquareRounded,
  IconFileText,
  IconExternalLink,
  IconPencil,
  IconUnlink,
  IconMarkdown,
  IconEye,
  IconTrash,
} from '@tabler/icons-vue'
// Action RPC (not entity CRUD) — see CLAUDE.md rule #4 exception: an upload
// stores a file in the knowledge base and answers with its reference.
import { upload } from '@/api'
import './kbProse.css'
import TableToolbar from '@/components/editor/TableToolbar.vue'
import KbLinkDialog from './KbLinkDialog.vue'
import KbDynamicContentDialog from './KbDynamicContentDialog.vue'
import {
  KbCallout,
  KbDetails,
  KbVideo,
  KbButton,
  KbFile,
  KbDc,
  KbImage,
  KbArticleLink,
} from './kbExtensions.js'
import { mdToEditorHtml, docToMarkdown, docHeadings, parseKbArticleHref } from './kbMarkdownDoc.js'

const props = defineProps({
  kbId: { type: String, required: true },
  /** The article being edited (left out of the article pickers). */
  articleId: { type: String, default: null },
  editable: { type: Boolean, default: true },
  /** Read-only display without the toolbar (history). */
  bare: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Write the answer. Type @ to link an article.' },
})
/**
 * THE KNOWLEDGE BASE ARTICLE EDITOR.
 *
 * Visual, but the article is MARKDOWN (v-model): Claude and the API push
 * Markdown, the AI reads it, history compares it. "Markdown" shows the text
 * itself, to read or type; both views edit the same article.
 *
 * Insert: image, video, table, divider, button, collapsible section, file,
 * dynamic content, code block, callout, article link. Type @ or & to link
 * another article. Paste or drop images and files to upload them to this
 * knowledge base (the Support Desk's storage).
 */
const md = defineModel({ type: String, default: '' })
const toast = useToast()

// ── What the pickers and chips need ─────────────────────────────────────────
const articles = useLiveQueryWithDeps(
  [() => props.kbId],
  async (db, [id]) => (id ? db.KbArticle.where('kbId', id).exec() : []),
  { models: ['KbArticle'], initial: [] },
)
const otherArticles = computed(() =>
  articles.value
    .filter((a) => a.id !== props.articleId && a.status !== 'ARCHIVED')
    .map((a) => ({ id: a.id, title: a.title, status: a.status, audience: a.audience })),
)
const snippets = useLiveQueryWithDeps(
  [() => props.kbId],
  async (db, [id]) => (id ? db.KbSnippet.where('kbId', id).exec() : []),
  { models: ['KbSnippet'], initial: [] },
)
const snippetMap = computed(() => new Map(snippets.value.map((s) => [s.key, s])))

// ── The editor ───────────────────────────────────────────────────────────────
let lastMd = null
const editor = useEditor({
  editable: props.editable,
  content: mdToEditorHtml(md.value),
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: false,
      underline: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      protocols: ['mailto', 'tel', 'kb-article'],
      isAllowedUri: (url) => /^(https?:\/\/|mailto:|tel:|#|kb-article:)/i.test(url || ''),
      HTMLAttributes: { rel: null, target: null, class: 'kb-link' },
    }),
    Placeholder.configure({ placeholder: props.placeholder }),
    Table.configure({ resizable: false, HTMLAttributes: { class: 'kb-table' } }),
    TableRow,
    TableHeader,
    TableCell,
    KbImage,
    KbCallout,
    KbDetails,
    KbVideo,
    KbButton,
    KbFile,
    KbDc.configure({ resolve: (key) => snippetMap.value.get(key) || null }),
    KbArticleLink.configure({ articles: async () => otherArticles.value }),
  ],
  editorProps: {
    attributes: { class: 'kb-prose', 'aria-label': 'Article text', spellcheck: 'true' },
    handleKeyDown(view, event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        // In the text, Ctrl/⌘+K is a link (as in Zendesk), not the app's command palette.
        event.stopPropagation()
        // After the editor has read the latest selection (a quick Shift+arrow then Ctrl+K).
        setTimeout(openLink, 0)
        return true
      }
      return false
    },
    handlePaste(view, event) {
      const files = [...(event.clipboardData?.files || [])]
      if (!files.length || !props.editable) return false
      event.preventDefault()
      uploadFiles(files)
      return true
    },
    handleDrop(view, event, slice, moved) {
      const files = [...(event.dataTransfer?.files || [])]
      if (moved || !files.length || !props.editable) return false
      event.preventDefault()
      const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
      uploadFiles(files, pos)
      return true
    },
  },
  onCreate({ editor: ed }) {
    lastMd = md.value
    headings.value = docHeadings(ed.getJSON())
  },
  onUpdate({ editor: ed }) {
    const json = ed.getJSON()
    headings.value = docHeadings(json)
    lastMd = docToMarkdown(json)
    md.value = lastMd
  },
})
const headings = ref([])

// The article changed from outside (another version loaded, a restore).
watch(md, (v) => {
  if (!editor.value || v === lastMd || mode.value === 'markdown') return
  lastMd = v
  editor.value.commands.setContent(mdToEditorHtml(v), { emitUpdate: false })
  headings.value = docHeadings(editor.value.getJSON())
})
watch(
  () => props.editable,
  (v) => editor.value?.setEditable(v),
)
// A dynamic-content value changed: show it in place.
watch(snippetMap, (m) => {
  const root = editor.value?.view?.dom
  if (!root) return
  for (const el of root.querySelectorAll('.kb-dc-chip')) {
    const key = el.closest('[data-key]')?.getAttribute('data-key') || el.dataset.key
    const s = key && m.get(key)
    if (s) {
      el.textContent = s.value || s.title
      el.classList.remove('kb-dc-chip--missing')
    }
  }
})

// ── Markdown view ────────────────────────────────────────────────────────────
const mode = ref('visual')
function setMode(m) {
  if (m === mode.value) return
  if (m === 'visual' && editor.value) {
    lastMd = md.value
    editor.value.commands.setContent(mdToEditorHtml(md.value), { emitUpdate: false })
    headings.value = docHeadings(editor.value.getJSON())
  }
  mode.value = m
}

// ── Toolbar ──────────────────────────────────────────────────────────────────
function run(fn) {
  if (!editor.value) return
  fn(editor.value.chain().focus()).run()
  // A toolbar menu gives focus back to its button as it closes; take it back.
  setTimeout(() => editor.value?.commands.focus(), 0)
}
const is = (name, attrs) => !!editor.value?.isActive(name, attrs)
const STYLES = [
  { label: 'Paragraph', level: 0 },
  { label: 'Heading 2', level: 2 },
  { label: 'Heading 3', level: 3 },
  { label: 'Heading 4', level: 4 },
]
const currentStyle = computed(() => {
  if (!editor.value) return 'Paragraph'
  return STYLES.find((s) => s.level && is('heading', { level: s.level }))?.label || 'Paragraph'
})
function setStyle(level) {
  run((c) => (level ? c.setHeading({ level }) : c.setParagraph()))
}
const styleItems = STYLES.map((s) => ({ name: s.label, click: () => setStyle(s.level) }))

const imageInput = ref(null)
const fileInput = ref(null)
const uploading = ref(0)
async function uploadFiles(files, pos = null) {
  for (const file of files) {
    uploading.value++
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await upload(`/v1/services/kb/bases/${props.kbId}/assets`, fd)
      const a = res.asset
      const node =
        a.kind === 'FILE'
          ? { type: 'kbFile', attrs: { asset: a.id, name: a.fileName || file.name } }
          : { type: 'image', attrs: { src: `kb-asset:${a.id}`, alt: '' } }
      const ed = editor.value
      if (!ed) continue
      // A line after it, so the next upload or the next words do not replace it.
      const content = [node, { type: 'paragraph' }]
      if (pos != null) ed.chain().focus().insertContentAt(pos, content).run()
      else ed.chain().focus().insertContent(content).run()
      setTimeout(() => editor.value?.commands.focus(), 0)
      pos = null
    } catch (e) {
      toast.error(e.message || `${file.name} could not be uploaded`)
    } finally {
      uploading.value--
    }
  }
}
function onPicked(e) {
  const files = [...(e.target.files || [])]
  e.target.value = ''
  if (files.length) uploadFiles(files)
}

const dcOpen = ref(false)
/**
 * A dialog gives focus back to whatever opened it when it closes; put the
 * caret back in the text instead, so typing carries on where it was.
 */
function refocusAfterDialog() {
  setTimeout(() => editor.value?.commands.focus(), 300)
}
function insertDc(key) {
  run((c) => c.insertContent({ type: 'kbDc', attrs: { key } }))
  refocusAfterDialog()
}
/** A block, then an empty line after it to keep writing. */
function insertBlock(node) {
  run((c) => c.insertContent([node, { type: 'paragraph' }]))
}
function startArticleLink() {
  run((c) => c.insertContent(' @'))
}
const insertItems = computed(() => [
  { name: 'Image', icon: IconPhoto, click: () => imageInput.value?.click() },
  {
    name: 'Video (YouTube, Vimeo, Loom)',
    icon: IconVideo,
    click: () => insertBlock({ type: 'kbVideo', attrs: { src: '' } }),
  },
  {
    name: 'Table',
    icon: IconTable,
    click: () => run((c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true })),
  },
  {
    name: 'Divider',
    icon: IconSeparatorHorizontal,
    click: () => run((c) => c.setHorizontalRule()),
  },
  {
    name: 'Button',
    icon: IconClick,
    click: () => insertBlock({ type: 'kbButton', attrs: { label: 'Contact support', href: '' } }),
  },
  {
    name: 'Collapsible section',
    icon: IconLayoutBottombarCollapse,
    click: () => run((c) => c.setKbDetails()),
  },
  { name: 'File', icon: IconPaperclip, click: () => fileInput.value?.click() },
  { name: 'Dynamic content', icon: IconBraces, click: () => (dcOpen.value = true) },
  { name: 'Code block', icon: IconSourceCode, click: () => run((c) => c.toggleCodeBlock()) },
  { name: 'Callout', icon: IconInfoSquareRounded, click: () => run((c) => c.setKbCallout('tip')) },
  { name: 'Article link (or type @)', icon: IconFileText, click: startArticleLink },
])

// ── Links ────────────────────────────────────────────────────────────────────
const link = ref({ open: false, href: '', text: '', hasSelection: false })
function openLink() {
  const ed = editor.value
  if (!ed) return
  const href = ed.getAttributes('link').href || ''
  if (href) ed.chain().extendMarkRange('link').run()
  const { from, to } = ed.state.selection
  link.value = {
    open: true,
    href,
    text: ed.state.doc.textBetween(from, to, ' '),
    hasSelection: from !== to,
  }
}
function applyLink({ href, text }) {
  const ed = editor.value
  if (!ed) return
  const { from, to } = ed.state.selection
  const current = ed.state.doc.textBetween(from, to, ' ')
  if (from === to || (text && text !== current)) {
    ed.chain()
      .focus()
      .insertContentAt(
        { from, to },
        { type: 'text', text: text || href, marks: [{ type: 'link', attrs: { href } }] },
      )
      .run()
  } else {
    ed.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }
  refocusAfterDialog()
}
function removeLink() {
  run((c) => c.extendMarkRange('link').unsetLink())
  refocusAfterDialog()
}
const linkHref = computed(() => (editor.value ? editor.value.getAttributes('link').href || '' : ''))
const linkLabel = computed(() => {
  const h = linkHref.value
  const art = parseKbArticleHref(h)
  if (art) {
    const a = articles.value.find((x) => x.id === art.articleId)
    return `Article: ${a ? a.title : 'deleted article'}${art.anchor ? ` #${art.anchor}` : ''}`
  }
  if (h.startsWith('#'))
    return `Heading: ${headings.value.find((x) => `#${x.id}` === h)?.text || h}`
  return h.replace(/^mailto:/, 'Email: ').replace(/^tel:/, 'Phone: ')
})
const linkOpenUrl = computed(() => (/^https?:\/\//i.test(linkHref.value) ? linkHref.value : null))
function linkBubbleShouldShow({ editor: ed, state }) {
  return ed.isEditable && ed.isActive('link') && state.selection.empty
}
function imageBubbleShouldShow({ editor: ed }) {
  return ed.isEditable && ed.isActive('image')
}
const imageAlt = computed({
  get: () => (editor.value ? editor.value.getAttributes('image').alt || '' : ''),
  set: (v) => editor.value?.chain().updateAttributes('image', { alt: v }).run(),
})

defineExpose({ focus: () => editor.value?.commands.focus() })
</script>

<template>
  <div class="kb-editor tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
    <div
      v-if="!bare && editable"
      class="tw:sticky tw:top-0 tw:z-10 tw:border-b tw:border-divider tw:bg-card"
    >
      <!-- Same column as the title and the text (kbProse.css .kb-editor-content). -->
      <div
        class="kb-editor-column tw:flex tw:flex-wrap tw:items-center tw:gap-0.5 tw:py-1.5"
        role="toolbar"
        aria-label="Formatting"
      >
        <template v-if="mode === 'visual'">
          <BaseMenu :items="styleItems">
            <template #trigger>
              <button
                type="button"
                class="kb-tb-btn tw:-ml-1.5 tw:min-w-24 tw:justify-between tw:gap-1"
                aria-label="Text style"
              >
                <span class="tw:text-sm">{{ currentStyle }}</span>
                <IconChevronDown :size="14" />
              </button>
            </template>
          </BaseMenu>
          <span class="kb-tb-sep" />
          <button
            type="button"
            class="kb-tb-btn"
            :class="{ 'is-active': is('bold') }"
            aria-label="Bold (Ctrl+B)"
            title="Bold (Ctrl+B)"
            @click="run((c) => c.toggleBold())"
          >
            <IconBold :size="16" />
          </button>
          <button
            type="button"
            class="kb-tb-btn"
            :class="{ 'is-active': is('italic') }"
            aria-label="Italic (Ctrl+I)"
            title="Italic (Ctrl+I)"
            @click="run((c) => c.toggleItalic())"
          >
            <IconItalic :size="16" />
          </button>
          <button
            type="button"
            class="kb-tb-btn"
            :class="{ 'is-active': is('strike') }"
            aria-label="Strikethrough"
            title="Strikethrough"
            @click="run((c) => c.toggleStrike())"
          >
            <IconStrikethrough :size="16" />
          </button>
          <button
            type="button"
            class="kb-tb-btn"
            :class="{ 'is-active': is('code') }"
            aria-label="Inline code"
            title="Inline code"
            @click="run((c) => c.toggleCode())"
          >
            <IconCode :size="16" />
          </button>
          <button
            type="button"
            class="kb-tb-btn"
            :class="{ 'is-active': is('link') }"
            aria-label="Link (Ctrl+K)"
            title="Link (Ctrl+K)"
            @click="openLink"
          >
            <IconLink :size="16" />
          </button>
          <span class="kb-tb-sep" />
          <button
            type="button"
            class="kb-tb-btn"
            :class="{ 'is-active': is('bulletList') }"
            aria-label="Bulleted list"
            title="Bulleted list"
            @click="run((c) => c.toggleBulletList())"
          >
            <IconList :size="16" />
          </button>
          <button
            type="button"
            class="kb-tb-btn"
            :class="{ 'is-active': is('orderedList') }"
            aria-label="Numbered list"
            title="Numbered list"
            @click="run((c) => c.toggleOrderedList())"
          >
            <IconListNumbers :size="16" />
          </button>
          <button
            type="button"
            class="kb-tb-btn"
            :class="{ 'is-active': is('blockquote') }"
            aria-label="Quote"
            title="Quote"
            @click="run((c) => c.toggleBlockquote())"
          >
            <IconBlockquote :size="16" />
          </button>
          <span class="kb-tb-sep" />
          <BaseMenu :items="insertItems">
            <template #trigger>
              <button type="button" class="kb-tb-btn tw:gap-1 tw:px-2" aria-label="Insert">
                <IconPlus :size="16" /> <span class="tw:text-sm">Insert</span>
                <IconChevronDown :size="14" />
              </button>
            </template>
          </BaseMenu>
          <span class="kb-tb-sep" />
          <button
            type="button"
            class="kb-tb-btn"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            :disabled="!editor?.can().undo()"
            @click="run((c) => c.undo())"
          >
            <IconArrowBackUp :size="16" />
          </button>
          <button
            type="button"
            class="kb-tb-btn"
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            :disabled="!editor?.can().redo()"
            @click="run((c) => c.redo())"
          >
            <IconArrowForwardUp :size="16" />
          </button>
          <BaseSpinner v-if="uploading" size="sm" class="tw:ml-2" />
        </template>
        <span v-else class="tw:text-xs tw:text-secondary">
          Markdown. Callouts <code>:::tip</code>, sections <code>:::details</code>, videos
          <code>::video{src="…"}</code>, buttons <code>::button[Text]{href="…"}</code>.
        </span>
        <div class="tw:flex-1" />
        <button
          type="button"
          class="kb-tb-btn tw:-mr-1.5 tw:gap-1 tw:px-2"
          :class="{ 'is-active': mode === 'markdown' }"
          :aria-pressed="mode === 'markdown'"
          :title="mode === 'markdown' ? 'Back to the visual editor' : 'Show and edit the Markdown'"
          @click="setMode(mode === 'markdown' ? 'visual' : 'markdown')"
        >
          <component :is="mode === 'markdown' ? IconEye : IconMarkdown" :size="16" />
          <span class="tw:text-sm">{{ mode === 'markdown' ? 'Visual' : 'Markdown' }}</span>
        </button>
        <input
          ref="imageInput"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          class="tw:hidden"
          @change="onPicked"
        />
        <input
          ref="fileInput"
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip"
          multiple
          class="tw:hidden"
          @change="onPicked"
        />
      </div>
    </div>

    <div v-show="mode === 'visual'" class="tw:min-h-0 tw:flex-1 tw:overflow-y-auto">
      <EditorContent :editor="editor" class="kb-editor-content" />
    </div>
    <textarea
      v-if="mode === 'markdown'"
      v-model="md"
      aria-label="Article text (Markdown)"
      class="tw:min-h-0 tw:flex-1 tw:resize-none tw:bg-card tw:px-8 tw:py-6 tw:text-sm tw:leading-6 tw:outline-none"
      spellcheck="true"
    />

    <BubbleMenu
      v-if="editor"
      pluginKey="kb-table-bubble"
      :editor="editor"
      :shouldShow="({ editor: ed }) => ed.isEditable && ed.isActive('table')"
      :options="{ placement: 'top' }"
    >
      <TableToolbar :editor="editor" />
    </BubbleMenu>
    <BubbleMenu
      v-if="editor"
      pluginKey="kb-link-bubble"
      :editor="editor"
      :shouldShow="linkBubbleShouldShow"
      :options="{ placement: 'bottom-start' }"
    >
      <div
        class="tw:flex tw:max-w-md tw:items-center tw:gap-1 tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:p-1 tw:pl-3 tw:shadow-lg"
      >
        <span class="tw:truncate tw:text-sm tw:text-secondary">{{ linkLabel }}</span>
        <a
          v-if="linkOpenUrl"
          :href="linkOpenUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="kb-tb-btn"
          aria-label="Open link"
          title="Open link"
          ><IconExternalLink :size="15"
        /></a>
        <button
          type="button"
          class="kb-tb-btn"
          aria-label="Edit link"
          title="Edit link"
          @click="openLink"
        >
          <IconPencil :size="15" />
        </button>
        <button
          type="button"
          class="kb-tb-btn"
          aria-label="Remove link"
          title="Remove link"
          @click="removeLink"
        >
          <IconUnlink :size="15" />
        </button>
      </div>
    </BubbleMenu>
    <BubbleMenu
      v-if="editor"
      pluginKey="kb-image-bubble"
      :editor="editor"
      :shouldShow="imageBubbleShouldShow"
      :options="{ placement: 'bottom' }"
    >
      <div
        class="tw:flex tw:items-center tw:gap-1 tw:rounded-lg tw:border tw:border-divider tw:bg-card tw:p-1 tw:shadow-lg"
      >
        <input
          v-model.lazy="imageAlt"
          class="tw:h-8 tw:w-72 tw:rounded-md tw:border tw:border-divider tw:bg-main tw:px-2 tw:text-sm"
          placeholder="Describe the image (for screen readers and search)"
          aria-label="Image description"
        />
        <button
          type="button"
          class="kb-tb-btn"
          aria-label="Remove image"
          title="Remove image"
          @click="run((c) => c.deleteSelection())"
        >
          <IconTrash :size="15" />
        </button>
      </div>
    </BubbleMenu>

    <KbLinkDialog
      v-model="link.open"
      :initialHref="link.href"
      :initialText="link.text"
      :hasSelection="link.hasSelection"
      :articles="otherArticles"
      :headings="headings"
      @submit="applyLink"
      @remove="removeLink"
    />
    <KbDynamicContentDialog v-if="kbId" v-model="dcOpen" :kbId="kbId" @insert="insertDc" />
  </div>
</template>

<style>
.kb-tb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 2rem;
  min-width: 2rem;
  padding: 0 0.375rem;
  border-radius: 0.375rem;
  color: var(--secondary, #475569);
}
.kb-tb-btn:hover:not(:disabled) {
  background: var(--main-hover, #f1f5f9);
  color: var(--on-main, #0f172a);
}
.kb-tb-btn.is-active {
  background: color-mix(in srgb, var(--primary, #136dec) 12%, transparent);
  color: var(--primary, #136dec);
}
.kb-tb-btn:disabled {
  opacity: 0.4;
}
.kb-tb-sep {
  width: 1px;
  height: 1.25rem;
  margin: 0 0.25rem;
  background: var(--divider, #e2e8f0);
}
</style>
