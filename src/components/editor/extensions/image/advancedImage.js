import { Node, mergeAttributes, nodeInputRule } from '@tiptap/core'
import { Plugin, NodeSelection, TextSelection } from '@tiptap/pm/state'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import ImageNodeView from './ImageNodeView.vue'
import { imageUploadPlugin, uploadKey, findUploadPlaceholderPos } from './imageUploadPlugin.js'
import { isValidImageFile, sanitizeImageUrl, nextUploadId, normalizeAlignment } from './helpers.js'

// Markdown-style image input: ![alt](src "title")
const INPUT_RX = /(?:^|\s)!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)$/

// Why a custom extension instead of @tiptap/extension-image:
//
//  - The default Image is an inline atom with only src/alt/title. No alignment,
//    no caption, no resize, no upload pipeline, no drag handle.
//  - To get Notion/Medium-style behavior (selection ring, side handles, caption,
//    upload placeholder) we need a NodeView. Once you need a NodeView, you also
//    own the schema, so extending the default extension would buy us nothing
//    over a clean Node.create.
//  - We declare the node as a *block* atom so it never gets stuck inside inline
//    contexts where alignment / float / caption can't be expressed in HTML.
//    Caption is stored as an attr (not as `content: inline*`) because that lets
//    images survive copy/paste across editors as a single <figure>, and gives
//    the NodeView full control over caption focus management — no awkward
//    cursor-walking-into-the-image issues.
export const AdvancedImage = Node.create({
  // Keep the node name as `image` so previously persisted documents that use
  // the default extension's name continue to round-trip cleanly.
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      // Uploader contract: async (file) => ({ url, width?, height?, id? })
      uploader: null,
      onUploadError: null,
      minWidth: 80,
      maxWidth: 1200,
      defaultAlignment: 'center',
    }
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => sanitizeImageUrl(el.getAttribute('src')) || null,
        renderHTML: (attrs) => {
          const src = sanitizeImageUrl(attrs.src)
          return src ? { src } : {}
        },
      },
      alt: {
        default: null,
        parseHTML: (el) => el.getAttribute('alt') || null,
        renderHTML: (attrs) => (attrs.alt ? { alt: attrs.alt } : {}),
      },
      title: {
        default: null,
        parseHTML: (el) => el.getAttribute('title') || null,
        renderHTML: (attrs) => (attrs.title ? { title: attrs.title } : {}),
      },
      width: {
        default: null,
        parseHTML: (el) => parseSize(el.getAttribute('width') || el.style.width),
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
      height: {
        default: null,
        parseHTML: (el) => parseSize(el.getAttribute('height') || el.style.height),
        renderHTML: (attrs) => (attrs.height ? { height: attrs.height } : {}),
      },
      alignment: {
        default: 'center',
        parseHTML: (el) => normalizeAlignment(el.getAttribute('data-alignment')),
        renderHTML: (attrs) => ({ 'data-alignment': normalizeAlignment(attrs.alignment) }),
      },
      caption: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-caption') || null,
        renderHTML: (attrs) => (attrs.caption ? { 'data-caption': attrs.caption } : {}),
      },
      loading: {
        default: 'lazy',
        parseHTML: (el) => el.getAttribute('loading') || 'lazy',
        renderHTML: (attrs) => ({ loading: attrs.loading || 'lazy' }),
      },
      dataId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id') || null,
        renderHTML: (attrs) => (attrs.dataId ? { 'data-id': attrs.dataId } : {}),
      },
      originalFilename: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-filename') || null,
        renderHTML: (attrs) =>
          attrs.originalFilename ? { 'data-filename': attrs.originalFilename } : {},
      },
    }
  },

  parseHTML() {
    return [
      // Preferred: <figure data-type="advanced-image"><img/><figcaption/></figure>
      {
        tag: 'figure[data-type="advanced-image"]',
        getAttrs: (el) => {
          const img = el.querySelector('img')
          if (!img) return false
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            title: img.getAttribute('title'),
            width: parseSize(img.getAttribute('width') || img.style.width),
            height: parseSize(img.getAttribute('height') || img.style.height),
            alignment: normalizeAlignment(el.getAttribute('data-alignment')),
            caption: el.querySelector('figcaption')?.textContent?.trim() || null,
            loading: img.getAttribute('loading') || 'lazy',
            dataId: img.getAttribute('data-id'),
            originalFilename: img.getAttribute('data-filename'),
          }
        },
      },
      // Fallback: bare <img> from legacy content / paste from other apps.
      {
        tag: 'img[src]',
        getAttrs: (el) => {
          const src = sanitizeImageUrl(el.getAttribute('src'))
          if (!src) return false
          return {
            src,
            alt: el.getAttribute('alt'),
            title: el.getAttribute('title'),
            width: parseSize(el.getAttribute('width') || el.style.width),
            height: parseSize(el.getAttribute('height') || el.style.height),
          }
        },
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const { caption, alignment, width, height, ...rest } = node.attrs
    const imgAttrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
      ...rest,
      width: width || null,
      height: height || null,
      class: 'tiptap-image__img',
    })
    const figureAttrs = {
      'data-type': 'advanced-image',
      'data-alignment': normalizeAlignment(alignment),
      class: `tiptap-image tiptap-image--align-${normalizeAlignment(alignment)}`,
    }
    const img = ['img', imgAttrs]
    if (caption) {
      return [
        'figure',
        figureAttrs,
        img,
        ['figcaption', { class: 'tiptap-image__caption' }, caption],
      ]
    }
    return ['figure', figureAttrs, img]
  },

  addNodeView() {
    return VueNodeViewRenderer(ImageNodeView)
  },

  addCommands() {
    return {
      setImage:
        (attrs) =>
        ({ commands }) => {
          const src = sanitizeImageUrl(attrs?.src)
          if (!src) return false
          return commands.insertContent({
            type: this.name,
            attrs: { ...attrs, src, alignment: normalizeAlignment(attrs?.alignment) },
          })
        },

      uploadImage:
        (file, posOverride) =>
        ({ editor }) => {
          if (!isValidImageFile(file)) {
            this.options.onUploadError?.(new Error('Invalid image file'))
            return false
          }
          if (!this.options.uploader) {
            this.options.onUploadError?.(new Error('No uploader configured'))
            return false
          }
          startUpload(
            editor,
            file,
            this.options.uploader,
            this.name,
            this.options.onUploadError,
            posOverride,
          )
          return true
        },

      setImageAlignment:
        (alignment) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { alignment: normalizeAlignment(alignment) }),

      setImageWidth:
        (width) =>
        ({ commands }) => {
          const n = Number(width)
          if (!Number.isFinite(n)) return false
          const clamped = Math.max(
            this.options.minWidth,
            Math.min(this.options.maxWidth, Math.round(n)),
          )
          return commands.updateAttributes(this.name, { width: clamped })
        },

      setImageCaption:
        (caption) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { caption: caption ?? null }),

      toggleImageCaption:
        () =>
        ({ editor, commands }) => {
          const current = editor.getAttributes(this.name)?.caption
          return commands.updateAttributes(this.name, {
            caption: current || current === '' ? null : '',
          })
        },

      setImageAlt:
        (alt) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { alt: alt ?? null }),
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-l': () =>
        this.editor.isActive(this.name) ? this.editor.commands.setImageAlignment('left') : false,
      'Mod-Shift-e': () =>
        this.editor.isActive(this.name) ? this.editor.commands.setImageAlignment('center') : false,
      'Mod-Shift-r': () =>
        this.editor.isActive(this.name) ? this.editor.commands.setImageAlignment('right') : false,
      'Mod-Shift-f': () =>
        this.editor.isActive(this.name) ? this.editor.commands.setImageAlignment('full') : false,

      // Enter on a selected image: drop the user into a new paragraph after
      // the image (or focus the existing trailing paragraph). Without this,
      // PM's default would replace the NodeSelection with a paragraph break,
      // wiping the image.
      Enter: () => insertParagraphAfterSelectedImage(this.editor, this.name),
    }
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: INPUT_RX,
        type: this.type,
        getAttributes: (match) => {
          const [, alt, src, title] = match
          const clean = sanitizeImageUrl(src)
          if (!clean) return null
          return { alt, src: clean, title }
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    const ext = this
    return [
      imageUploadPlugin(),
      new Plugin({
        props: {
          // PM default: any input event with an active selection replaces
          // that selection — including a NodeSelection on our image. When
          // the user clicks an image and then types, the keystroke replaces
          // the image. Intercept text input on a NodeSelection of our type,
          // collapse the selection to *after* the image, and re-dispatch
          // the text into the paragraph that follows (creating one if
          // necessary). Notion/Medium use the same trick.
          handleTextInput(view, _from, _to, text) {
            return diverTextInputAroundImage(view, text, ext.name)
          },
        },
      }),
      new Plugin({
        props: {
          handleDrop(view, event, _slice, moved) {
            // moved=true means this is an internal drag (existing node), let PM handle it
            if (moved) return false
            const files = Array.from(event.dataTransfer?.files || []).filter((f) =>
              f.type.startsWith('image/'),
            )
            if (!files.length) return false
            event.preventDefault()
            const coords = { left: event.clientX, top: event.clientY }
            const dropPos = view.posAtCoords(coords)?.pos ?? view.state.selection.from
            files.forEach((file) => {
              if (!isValidImageFile(file)) {
                ext.options.onUploadError?.(new Error('Invalid image file'))
                return
              }
              if (!ext.options.uploader) return
              startUpload(
                ext.editor,
                file,
                ext.options.uploader,
                ext.name,
                ext.options.onUploadError,
                dropPos,
              )
            })
            return true
          },
          handlePaste(_view, event) {
            const items = Array.from(event.clipboardData?.items || [])
            const imageItems = items.filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
            if (!imageItems.length) return false
            event.preventDefault()
            imageItems.forEach((item) => {
              const file = item.getAsFile()
              if (!file || !isValidImageFile(file)) return
              if (!ext.options.uploader) return
              startUpload(
                ext.editor,
                file,
                ext.options.uploader,
                ext.name,
                ext.options.onUploadError,
              )
            })
            return true
          },
        },
      }),
    ]
  },
})

// Drives the upload + placeholder lifecycle. Why not a Tiptap command:
// the upload is async, so the second transaction (replace placeholder with
// real image) must read the *current* state at that future time. Encapsulating
// this inside a function that captures the editor reference is simpler than
// chaining promise-returning commands.
async function startUpload(editor, file, uploader, typeName, onError, posOverride) {
  if (!editor || editor.isDestroyed) return

  // Capture insertion position *before* the await. Default to `selection.to`
  // (end of selection) so a highlighted range is preserved — the image
  // lands AFTER the selected text instead of replacing it. This is the
  // single biggest source of "my content disappeared on upload" bugs:
  // `insertContent(content)` (no pos) uses current selection, which
  // replaceSelection-style commands then overwrite. We use insertContentAt
  // with a numeric pos below, which never touches selection.
  const startPos = posOverride ?? editor.state.selection.to
  const placeholderId = nextUploadId()

  // Add a decoration at startPos. The plugin maps its position through every
  // subsequent transaction, so if the user types/undoes during the upload
  // the image still lands at the user's *intended* spot, not a stale
  // numeric position that's now pointing into the middle of new text.
  editor.view.dispatch(
    editor.state.tr.setMeta(uploadKey, { add: { id: placeholderId, pos: startPos } }),
  )

  try {
    console.debug('[AdvancedImage] upload start', {
      file: file.name,
      type: file.type,
      size: file.size,
      startPos,
    })
    const result = await uploader(file)
    console.debug('[AdvancedImage] uploader result', result)

    if (editor.isDestroyed) return
    if (!result?.url) throw new Error('Uploader returned no URL — check backend response shape')

    const safeSrc = sanitizeImageUrl(result.url)
    if (!safeSrc) {
      throw new Error(`URL failed sanitization: ${result.url}`)
    }

    const insertPos = findUploadPlaceholderPos(editor.state, placeholderId)
    if (insertPos == null) {
      onError?.(new Error('Upload placeholder was removed before upload completed'))
      return
    }

    const attrs = {
      src: safeSrc,
      alt: stripExtension(file.name),
      width: result.width || null,
      height: result.height || null,
      dataId: result.id || null,
      originalFilename: file.name,
    }

    console.debug('[AdvancedImage] inserting at pos', insertPos, attrs)

    // insertContentAt(<number>, ...) inserts at the exact position WITHOUT
    // touching the current selection. `.focus()` brings focus back to the
    // editor without changing the selection target (it would only matter
    // if focus had been lost to the file picker / drop event).
    editor.chain().insertContentAt(insertPos, { type: typeName, attrs }).focus().run()

    editor.view.dispatch(editor.state.tr.setMeta(uploadKey, { remove: { id: placeholderId } }))
    console.debug('[AdvancedImage] doc HTML after insert:', editor.getHTML())
  } catch (err) {
    if (!editor.isDestroyed) {
      editor.view.dispatch(editor.state.tr.setMeta(uploadKey, { remove: { id: placeholderId } }))
    }
    console.error('[AdvancedImage] upload failed:', err)
    onError?.(err)
  }
}

// Push text input past a selected image rather than replacing the image.
// Returns true if we handled it (PM should not run its default), false to let
// PM continue normally (no image selected, or schema can't host the text).
function diverTextInputAroundImage(view, text, imageTypeName) {
  const { state } = view
  const sel = state.selection
  if (!(sel instanceof NodeSelection)) return false
  if (sel.node.type.name !== imageTypeName) return false

  const after = sel.to
  const paraType = state.schema.nodes.paragraph
  if (!paraType) return false

  const $after = state.doc.resolve(after)
  const nextNode = $after.nodeAfter
  const tr = state.tr

  if (nextNode && nextNode.isTextblock) {
    // There's already a paragraph (or heading, etc.) after the image — land
    // the cursor at its start and type into it.
    const target = after + 1
    tr.setSelection(TextSelection.create(state.doc, target)).insertText(text)
  } else {
    // No textblock after the image (image is last child / followed by another
    // atom). Insert a fresh paragraph carrying the typed character.
    const para = paraType.create(null, state.schema.text(text))
    tr.insert(after, para)
    // +1 to enter the new paragraph, +text.length to land after the typed char
    tr.setSelection(TextSelection.create(tr.doc, after + 1 + text.length))
  }

  tr.scrollIntoView()
  view.dispatch(tr)
  return true
}

// Enter on a selected image: same logic, but no text payload — just drop the
// cursor into a new (or existing) paragraph after the image.
function insertParagraphAfterSelectedImage(editor, imageTypeName) {
  const { state } = editor
  const sel = state.selection
  if (!(sel instanceof NodeSelection)) return false
  if (sel.node.type.name !== imageTypeName) return false

  const after = sel.to
  const paraType = state.schema.nodes.paragraph
  if (!paraType) return false

  const $after = state.doc.resolve(after)
  const nextNode = $after.nodeAfter
  const tr = state.tr

  if (nextNode && nextNode.isTextblock) {
    tr.setSelection(TextSelection.create(state.doc, after + 1))
  } else {
    tr.insert(after, paraType.create())
    tr.setSelection(TextSelection.create(tr.doc, after + 1))
  }

  tr.scrollIntoView()
  editor.view.dispatch(tr)
  return true
}

function parseSize(value) {
  if (value == null || value === '') return null
  const n = parseInt(String(value), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function stripExtension(name) {
  if (!name) return null
  return name.replace(/\.[^.]+$/, '') || name
}
