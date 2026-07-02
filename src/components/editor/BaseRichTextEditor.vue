<script setup>
import {
  IconBold,
  IconItalic,
  IconStrikethrough,
  IconHighlight,
  IconCode,
  IconLink,
  IconLinkOff,
  IconX,
  IconCheck,
  IconH3,
  IconH4,
} from '@tabler/icons-vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import EditorToolbar from './EditorToolbar.vue'
import TableToolbar from './TableToolbar.vue'
import LinkDialog from './LinkDialog.vue'
import ImageCropDialog from '@/components/common/ImageCropDialog.vue'
import ImageBubbleMenu from './extensions/image/ImageBubbleMenu.vue'
import { AdvancedImage } from './extensions/image/advancedImage.js'
import { uploadFile } from '@/composables/useFileUpload.js'
import { DocumentMention } from './extensions/documentMention/documentMention.js'
import { UserMention } from './extensions/userMention/userMention.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  placeholder: {
    type: String,
    default: 'Start typing...',
  },
  editable: {
    type: Boolean,
    default: true,
  },
  contentType: {
    type: String,
    default: 'html', // 'html', 'json', or 'text'
    validator: (value) => ['html', 'json', 'text'].includes(value),
  },
  // When set, h3 headings render as "N.1 …" and h4 as "N.1.1 …" via CSS
  // counters scoped to this editor. N is the parent section's number (1-based).
  // Leave null to disable numbering — H1/H2 are never auto-numbered.
  sectionNumber: {
    type: [Number, null],
    default: null,
  },
})

const modelValue = defineModel({ type: [String, Object], default: '' })

const menuItems = [
  { icon: IconBold, action: 'bold', label: 'Bold' },
  { icon: IconItalic, action: 'italic', label: 'Italic' },
  { icon: IconStrikethrough, action: 'strike', label: 'Strikethrough' },
  { icon: IconHighlight, action: 'highlight', label: 'Highlight' },
  { divider: true },
  // Heading 3 / 4 — promote the selection to a QMS sub-section (N.1) or
  // sub-sub-section (N.1.1). The numbering is added by CSS counters.
  { icon: IconH3, action: 'heading', level: 3, label: 'Sub-section (N.1)' },
  { icon: IconH4, action: 'heading', level: 4, label: 'Sub-sub-section (N.1.1)' },
  { divider: true },
  { icon: IconCode, action: 'code', label: 'Code' },
]

const showLinkInput = ref(false)
const linkUrl = ref('')
const showLinkDialog = ref(false)
const initialLinkUrl = ref('')

const imageUploading = ref(false)
const router = useRouter()
const toast = useToast()

// Bridges the AdvancedImage extension's uploader contract to this project's
// upload composable. Tracks an active count for the toolbar spinner — the
// in-document placeholder is rendered separately by the extension itself.
async function uploadImageFile(file) {
  imageUploading.value = true
  try {
    const result = await uploadFile(file, 'ASSET')
    if (!result.success || !result.asset?.url) {
      throw new Error(result.error || 'Upload failed')
    }
    return {
      url: result.asset.url,
      id: result.asset.id ?? null,
      width: result.asset.width ?? null,
      height: result.asset.height ?? null,
    }
  } finally {
    imageUploading.value = false
  }
}

function handleUploadError(err) {
  toast.error(err?.message || 'Image upload failed')
}

// Image-crop dialog state. The toolbar (and bubble-menu "Replace") routes the
// picked file through the cropper before handing it to the extension upload
// pipeline so users can frame the image before it leaves the browser.
const showCropDialog = ref(false)
const cropFile = ref(null)
const showCameraDialog = ref(false)
// 'insert' = new image at insertPos; 'replace' = swap the currently selected
// image's attrs.
const cropMode = ref('insert')
const insertPos = ref(null)

// Toolbar entry point — defers to the extension's command so paste/drop and
// toolbar uploads share the same placeholder + replace pipeline.
//
// We snapshot `selection.to` here rather than letting startUpload read it,
// because there's a small window between the file picker closing and this
// handler firing where focus events / DOM blurs could nudge the selection.
// `.to` (not `.from`) is intentional: if the user had a range selected, the
// image goes AFTER it; the selection's content is preserved.
function handleToolbarImageUpload(file) {
  if (!editor.value || !file) return
  insertPos.value = editor.value.state.selection.to
  cropMode.value = 'insert'
  cropFile.value = file
  showCropDialog.value = true
}

// Bubble-menu "Replace" action: open a picker, then route through the cropper
// before swapping the current image node's attrs.
function handleReplaceImage() {
  if (!editor.value) return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    cropMode.value = 'replace'
    cropFile.value = file
    showCropDialog.value = true
  }
  input.click()
}

// Bubble-menu "Crop" action on an already-uploaded image: fetch the current
// src into a File, then reuse the replace pipeline so the cropped result is
// uploaded fresh and the node's attrs are swapped to the new asset.
async function handleCropImage() {
  if (!editor.value) return
  const attrs = editor.value.getAttributes('image') || {}
  const src = attrs.src
  if (!src) return
  try {
    const res = await fetch(src, { credentials: 'include' })
    if (!res.ok) throw new Error(`Failed to load image (${res.status})`)
    const blob = await res.blob()
    const name = attrs.originalFilename || src.split('/').pop()?.split('?')[0] || 'image.jpg'
    const file = new File([blob], name, { type: blob.type || 'image/jpeg' })
    cropMode.value = 'replace'
    cropFile.value = file
    showCropDialog.value = true
  } catch (err) {
    handleUploadError(err)
  }
}

async function handleCropSave({ file }) {
  showCropDialog.value = false
  if (!editor.value || !file) return

  if (cropMode.value === 'replace') {
    try {
      const result = await uploadImageFile(file)
      editor.value
        .chain()
        .focus()
        .updateAttributes('image', {
          src: result.url,
          dataId: result.id,
          originalFilename: file.name,
          width: result.width || null,
          height: result.height || null,
        })
        .run()
    } catch (err) {
      handleUploadError(err)
    }
    return
  }

  // Insert flow — let the extension drive the placeholder + replace pipeline.
  editor.value.commands.uploadImage(file, insertPos.value)
}

const editor = useEditor({
  content: modelValue.value,
  editable: props.editable,
  editorProps: {
    // Image paste/drop are handled inside AdvancedImage's own ProseMirror
    // plugin — we intentionally don't intercept clipboard images here so the
    // extension owns the full upload/placeholder pipeline.
    handleClick(_view, _pos, event) {
      const mentionEl = event.target.closest(
        'a[data-type="documentMention"], a[data-type="userMention"]',
      )
      if (!mentionEl) return false

      event.preventDefault()
      const type = mentionEl.getAttribute('data-type')
      const id = mentionEl.getAttribute('data-id')
      if (!id) return false

      if (type === 'documentMention') {
        router.push(getCompanyPath(`/documents/${id}`))
      } else if (type === 'userMention') {
        router.push(getCompanyPath(`/users/${id}`))
      }
      return true
    },
  },
  extensions: [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3, 4],
      },
      link: false, // We'll use the Link extension separately to customize it
    }),
    Highlight,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'tw:text-primary! tw:underline! tw:cursor-pointer',
      },
    }),
    Placeholder.configure({
      placeholder: props.placeholder,
    }),
    AdvancedImage.configure({
      uploader: uploadImageFile,
      onUploadError: handleUploadError,
      minWidth: 80,
      maxWidth: 1600,
    }),
    Table.configure({
      resizable: true,
      HTMLAttributes: {
        class: 'tiptap-table',
      },
    }),
    TableRow,
    TableHeader,
    TableCell,
    DocumentMention,
    UserMention,
  ],
  onUpdate: ({ editor }) => {
    lastLocalEditAt = Date.now()
    modelValue.value = getContent(editor)
  },
})

// Round-trip suppression. When the editor commits a change, the value flows
// out via v-model → parent → syncEngine save → backend → IDB → live-query
// re-emits → parent → v-model → back to us. The "back to us" step lands here
// in the modelValue watcher, and if the backend mutated the HTML at all
// (sanitization, attribute normalization, whitespace), the watcher sees a
// difference and calls setContent — which destroys whatever the user did
// after the edit fired (including newly-inserted images, formatting, etc).
//
// Fix: for SETCONTENT_COOLDOWN_MS after any local edit, ignore parent pushes.
// External changes outside this window (initial load, another user via collab)
// still flow through normally.
let lastLocalEditAt = 0
const SETCONTENT_COOLDOWN_MS = 2500

function executeCommand(item) {
  if (!editor.value) return

  if (item.action === 'heading') {
    editor.value.chain().focus().toggleHeading({ level: item.level }).run()
    return
  }

  const command = `toggle${item.action.charAt(0).toUpperCase() + item.action.slice(1)}`
  editor.value.chain().focus()[command]().run()
}

function isItemActive(item) {
  if (!editor.value) return false
  if (item.action === 'heading') return editor.value.isActive('heading', { level: item.level })
  return editor.value.isActive(item.action)
}

function toggleLinkInput() {
  if (!editor.value) return

  const previousUrl = editor.value.getAttributes('link').href
  linkUrl.value = previousUrl || ''
  showLinkInput.value = !showLinkInput.value

  if (!showLinkInput.value && linkUrl.value) {
    setLink()
  }
}

function openLinkDialog() {
  if (!editor.value) return

  const previousUrl = editor.value.getAttributes('link').href
  initialLinkUrl.value = previousUrl || ''
  showLinkDialog.value = true
}

function setLink() {
  if (!editor.value) return

  if (linkUrl.value === '') {
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
  } else {
    let url = linkUrl.value.trim()
    if (url && !url.match(/^https?:\/\//)) {
      url = 'https://' + url
    }
    editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }
  showLinkInput.value = false
}

function handleLinkSubmit({ url, text }) {
  if (!editor.value) return

  if (url) {
    if (text && editor.value.state.selection.empty) {
      // If there's link text and no selection, insert text with link
      editor.value
        .chain()
        .focus()
        .insertContent({ type: 'text', marks: [{ type: 'link', attrs: { href: url } }], text })
        .run()
    } else {
      // If there's a selection or no text, just apply/update the link
      editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }
}

function handleLinkRemove() {
  if (!editor.value) return
  editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
}

function handleLinkKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    setLink()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    showLinkInput.value = false
  }
}

// Text-format bubble menu must hide when a node is selected (image, etc.) or
// the cursor is inside a table — those have their own menus, and stacking
// causes overlap. Default bubble-menu behavior shows for any non-empty
// selection, including NodeSelection, which is why this filter is needed.
function textBubbleShouldShow({ editor, state }) {
  const { selection } = state
  if (selection.empty) return false
  if (selection.node) return false
  if (editor.isActive('image')) return false
  if (editor.isActive('table')) return false
  return true
}

function getContent(editorInstance) {
  if (!editorInstance) return ''

  switch (props.contentType) {
    case 'json':
      return editorInstance.getJSON()
    case 'text':
      return editorInstance.getText()
    case 'html':
    default:
      return editorInstance.getHTML()
  }
}

function setContent(content) {
  if (!editor.value || !content) return

  const rawCurrentContent = getContent(editor.value)
  const currentContent =
    typeof rawCurrentContent === 'string'
      ? rawCurrentContent.trim()
      : JSON.stringify(rawCurrentContent)
  const newContent = typeof content === 'string' ? content.trim() : JSON.stringify(content)

  if (currentContent === newContent) return

  // Loud: if this fires while the user is actively editing, it's the
  // round-trip-strips-content bug. The cooldown guard below should prevent
  // it, but we still want visibility if something gets through.
  if (import.meta.env.DEV) {
    console.warn('[BaseRichTextEditor] setContent replacing doc', {
      currentLength: currentContent.length,
      newLength: newContent.length,
      msSinceLocalEdit: Date.now() - lastLocalEditAt,
    })
  }

  try {
    editor.value.commands.setContent(content)
  } catch (error) {
    console.error('Error setting editor content:', error)
  }
}

watch(
  () => modelValue.value,
  (newValue) => {
    // Suppress parent pushes that arrive within the cooldown window after a
    // local edit — they're almost always the save round-trip echoing back a
    // sanitized version of what we just sent. See cooldown comment above.
    if (Date.now() - lastLocalEditAt < SETCONTENT_COOLDOWN_MS) return
    setContent(newValue)
  },
)

watch(
  () => props.editable,
  (newValue) => {
    if (editor.value) {
      editor.value.setEditable(newValue)
    }
  },
)

onMounted(() => {
  if (modelValue.value) {
    setContent(modelValue.value)
  }
})

onBeforeUnmount(() => {
  if (editor.value) {
    editor.value.destroy()
  }
})

/**
 * Append plain text to the end of the document (new paragraph) — used by
 * injected tools like voice-to-text. Never overwrites existing content.
 */
function appendText(text) {
  const t = (text || '').trim()
  if (!editor.value || !t) return
  editor.value.chain().focus('end').insertContent(`<p>${t}</p>`).run()
}

defineExpose({
  editor,
  setContent,
  appendText,
  getContent: () => (editor.value ? getContent(editor.value) : ''),
})
</script>

<template>
  <div
    class="tiptap-editor-wrapper"
    :class="{ 'numbered-headings': sectionNumber != null }"
    :style="sectionNumber != null ? { '--section-number': sectionNumber } : undefined"
  >
    <!-- Editor Toolbar -->
    <EditorToolbar
      v-if="editor && editable"
      :editor="editor"
      :imageUploading="imageUploading"
      @toggleLink="openLinkDialog"
      @uploadImage="handleToolbarImageUpload"
      @takePhoto="showCameraDialog = true"
    >
      <!-- AI-free extension point: sidecar tools (e.g. voice-to-text) inject
           here. The base editor stays AI-agnostic; injected tools get the
           editor + appendText to write into the document. -->
      <slot v-if="editable" name="toolbar-extra" :editor="editor" :append="appendText" />
    </EditorToolbar>

    <!-- Image bubble menu (appears when an image node is selected) -->
    <ImageBubbleMenu
      v-if="editor && editable"
      :editor="editor"
      @replace="handleReplaceImage"
      @crop="handleCropImage"
    />

    <!-- Image Crop Dialog (opens before any image is uploaded) -->
    <ImageCropDialog
      v-model="showCropDialog"
      :initialFile="cropFile"
      :aspectRatio="null"
      title="Crop Image"
      @save="handleCropSave"
    />

    <!-- Camera capture (getUserMedia) — captured photo runs the image pipeline -->
    <CameraCaptureDialog v-model="showCameraDialog" @captured="handleToolbarImageUpload" />

    <!-- Link Dialog -->
    <LinkDialog
      v-model="showLinkDialog"
      :initialUrl="initialLinkUrl"
      @submit="handleLinkSubmit"
      @remove="handleLinkRemove"
    />

    <!-- Bubble Menu (appears on text selection) -->
    <BubbleMenu
      v-if="editor && editable"
      pluginKey="text-bubble-menu"
      :editor="editor"
      :shouldShow="textBubbleShouldShow"
      :tippyOptions="{ duration: 100 }"
    >
      <div
        class="tw:flex tw:flex-wrap tw:max-w-[90vw] tw:items-center tw:gap-1 tw:p-1 tw:bg-white tw:rounded-lg tw:shadow-xl tw:border tw:border-divider"
      >
        <!-- Link Input Mode -->
        <template v-if="showLinkInput">
          <div class="tw:relative">
            <BaseTextInput
              v-model="linkUrl"
              placeholder="Enter URL"
              class="tw:min-w-64! tw:pr-8"
              autofocus
              @keydown="handleLinkKeydown"
            />
            <button
              class="tw:absolute tw:right-2 tw:top-1/2 tw:-translate-y-1/2 tw:text-green-600 tw:bg-transparent tw:border-0 tw:cursor-pointer tw:p-0"
              @click="setLink"
            >
              <IconCheck :size="18" />
            </button>
          </div>
          <button
            class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:text-secondary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-sidebar"
            @click="showLinkInput = false"
          >
            <IconX :size="18" />
          </button>
        </template>

        <!-- Normal Menu Items -->
        <template v-else>
          <template v-for="(item, index) in menuItems" :key="index">
            <div v-if="item.divider" class="tw:w-px tw:h-5 tw:bg-divider tw:mx-0.5" />
            <button
              v-else
              class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:transition-colors tw:border-0 tw:cursor-pointer"
              :class="
                isItemActive(item)
                  ? 'tw:bg-primary tw:text-white'
                  : 'tw:text-secondary tw:bg-transparent tw:hover:bg-sidebar tw:hover:text-on-sidebar'
              "
              :title="item.label"
              @click="executeCommand(item)"
            >
              <component :is="item.icon" :size="18" />
            </button>
          </template>
          <!-- Link Button -->
          <button
            class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:transition-colors tw:border-0 tw:cursor-pointer"
            :class="
              editor.isActive('link')
                ? 'tw:bg-primary tw:text-white'
                : 'tw:text-secondary tw:bg-transparent tw:hover:bg-sidebar tw:hover:text-on-sidebar'
            "
            title="Link"
            @click="toggleLinkInput"
          >
            <IconLink :size="18" />
          </button>
          <!-- Unlink Button (only show when link is active) -->
          <button
            v-if="editor.isActive('link')"
            class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:transition-colors tw:border-0 tw:cursor-pointer tw:text-red-500 tw:bg-transparent tw:hover:bg-sidebar"
            title="Remove Link"
            @click="handleLinkRemove"
          >
            <IconLinkOff :size="18" />
          </button>
        </template>
      </div>
    </BubbleMenu>

    <!-- Table Toolbar (appears when cursor is in a table) -->
    <BubbleMenu
      v-if="editor && editable"
      pluginKey="table-bubble-menu"
      :editor="editor"
      :shouldShow="({ editor }) => editor.isActive('table')"
      :tippyOptions="{ duration: 100, placement: 'top' }"
    >
      <TableToolbar :editor="editor" />
    </BubbleMenu>

    <!-- Editor Content -->
    <EditorContent :editor="editor" class="rich-text-editor-content" />
  </div>
</template>

<style lang="scss" scoped>
.tiptap-editor-wrapper {
  border: 1px solid var(--divider);
  border-radius: 4px;
  background: var(--sidebar);
  color: var(--on-main);
  min-height: 100px;
  display: flex;
  flex-direction: column;
}

.rich-text-editor-content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

/* Force active button styling */
:deep(.q-btn.tw\:bg-primary\!) {
  background-color: var(--primary) !important;
  color: white !important;
}

.rich-text-editor-content :deep(.ProseMirror) {
  outline: none;
  flex-grow: 1;

  > * + * {
    margin-top: 0.75em;
  }

  h1 {
    font-size: 2em;
    font-weight: bold;
    line-height: 1.2;
  }

  h2 {
    font-size: 1.5em;
    font-weight: bold;
    line-height: 1.3;
  }

  h3 {
    font-size: 1.25em;
    font-weight: bold;
    line-height: 1.4;
  }

  h4 {
    font-size: 1.1em;
    font-weight: bold;
    line-height: 1.4;
  }

  ul,
  ol {
    padding-left: 1.5rem;
  }

  ul {
    list-style-type: disc;
  }

  ol {
    list-style-type: decimal;
  }

  blockquote {
    padding-left: 1rem;
    border-left: 3px solid var(--divider);
    font-style: italic;
  }

  code {
    background: var(--main-hover);
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.9em;
  }

  pre {
    background: #1e293b;
    color: #f1f5f9;
    padding: 0.75rem 1rem;
    border-radius: 4px;
    overflow-x: auto;

    code {
      background: none;
      color: inherit;
      padding: 0;
      font-size: inherit;
    }
  }

  mark {
    background: #fef08a;
    color: #1f2937;
    padding: 0.125rem 0;
    border-radius: 2px;
  }

  a {
    color: var(--primary);
    text-decoration: underline;
    cursor: pointer;
    transition: color 0.2s;

    &:hover {
      color: var(--primary-hover);
    }
  }

  hr {
    border: none;
    border-top: 2px solid var(--divider);
    margin: 2rem 0;
  }

  /* Table Styles */
  table {
    border-collapse: collapse;
    table-layout: fixed;
    width: 100%;
    margin: 1rem 0;
    overflow: hidden;

    td,
    th {
      min-width: 1em;
      border: 1px solid var(--divider);
      padding: 0.5rem 0.75rem;
      vertical-align: top;
      box-sizing: border-box;
      position: relative;

      > * {
        margin-bottom: 0;
      }
    }

    th {
      font-weight: bold;
      text-align: left;
      background-color: var(--main-hover);
    }

    .selectedCell:after {
      z-index: 2;
      position: absolute;
      content: '';
      left: 0;
      right: 0;
      top: 0;
      bottom: 0;
      background: rgba(200, 200, 255, 0.4);
      pointer-events: none;
    }

    .column-resize-handle {
      position: absolute;
      right: -2px;
      top: 0;
      bottom: -2px;
      width: 4px;
      background-color: var(--primary);
      pointer-events: none;
    }
  }

  p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    float: left;
    color: var(--secondary);
    pointer-events: none;
    height: 0;
  }

  .mention-chip {
    background: var(--main-hover);
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    text-decoration: none;
    color: inherit;
    white-space: nowrap;
  }

  .mention-chip:hover {
    opacity: 0.8;
  }
}

/* QMS hierarchical numbering — when the parent passes `sectionNumber`,
 * the wrapper sets the --section-number CSS variable and adds the
 * .numbered-headings class. CSS counters then auto-prefix:
 *   h3 → "N.1 Title", "N.2 Title", …
 *   h4 → "N.1.1 Title", "N.1.2 Title", …
 * Counters scope to this editor instance; insertions/deletions reflow
 * automatically. H1/H2 are intentionally not numbered — sections own
 * the top-level number, and h1/h2 are unusual inside a section body.
 *
 * The section number is converted into a CSS counter via counter-reset
 * because the `content` property accepts counter() but rejects bare
 * integer tokens — using var(--section-number) directly inside content
 * silently fails. */
.numbered-headings .rich-text-editor-content :deep(.ProseMirror) {
  counter-reset: section-num var(--section-number, 0) subsection 0;

  h3 {
    counter-increment: subsection;
    counter-reset: subsubsection 0;
  }

  h3::before {
    content: counter(section-num) '.' counter(subsection) '   ';
    color: inherit;
    white-space: pre;
  }

  h4 {
    counter-increment: subsubsection;
  }

  h4::before {
    content: counter(section-num) '.' counter(subsection) '.' counter(subsubsection) '   ';
    color: inherit;
    white-space: pre;
  }
}
</style>
