/**
 * The knowledge base editor's own blocks (TipTap). Each one has a Markdown
 * form (kbMarkdownDoc.js): the editor parses the data-type HTML that
 * mdToEditorHtml makes, and docToMarkdown writes the directive back.
 */
import { Node, Extension, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer, VueRenderer } from '@tiptap/vue-3'
import Image from '@tiptap/extension-image'
import Suggestion from '@tiptap/suggestion'
import { PluginKey, TextSelection } from '@tiptap/pm/state'
import tippy from 'tippy.js'
import KbCalloutView from './KbCalloutView.vue'
import KbDetailsView from './KbDetailsView.vue'
import KbVideoView from './KbVideoView.vue'
import KbButtonView from './KbButtonView.vue'
import KbFileView from './KbFileView.vue'
import KbArticlePickList from './KbArticlePickList.vue'
import { kbAssetUrl } from '../kbMarkdown.js'
import { parseKbAssetRef, kbArticleHref } from './kbMarkdownDoc.js'

/** Inputs inside a node view (a callout's title, a button's link) keep their keys. */
function stopFormEvents({ event }) {
  const t = event?.target
  return !!t && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName)
}

/**
 * Enter on an empty last line inside a callout or section steps out of it
 * (as Enter on an empty list item ends the list), so writing carries on below.
 */
function exitOnEmptyLast(editor, typeName) {
  const { $from, empty } = editor.state.selection
  if (!empty || $from.parent.type.name !== 'paragraph' || $from.parent.content.size) return false
  const d = $from.depth - 1
  if (d < 1) return false
  const container = $from.node(d)
  if (container.type.name !== typeName || container.childCount < 2) return false
  if ($from.index(d) !== container.childCount - 1) return false
  const afterContainer = $from.after(d)
  return editor
    .chain()
    .command(({ tr }) => {
      tr.delete($from.before(), $from.after())
      const pos = tr.mapping.map(afterContainer)
      tr.insert(pos, editor.schema.nodes.paragraph.create())
      tr.setSelection(TextSelection.create(tr.doc, pos + 1))
      return true
    })
    .run()
}

function dataAttr(name, fallback = '') {
  return {
    default: fallback,
    parseHTML: (el) => el.getAttribute(`data-${name}`) ?? fallback,
    renderHTML: (attrs) => ({ [`data-${name}`]: attrs[name] ?? fallback }),
  }
}

export const KbCallout = Node.create({
  name: 'kbCallout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return { kind: dataAttr('kind', 'note'), title: dataAttr('title', '') }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="kb-callout"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'kb-callout' }), 0]
  },
  addNodeView() {
    return VueNodeViewRenderer(KbCalloutView, { stopEvent: stopFormEvents })
  },
  addKeyboardShortcuts() {
    return { Enter: () => exitOnEmptyLast(this.editor, this.name) }
  },
  addCommands() {
    return {
      setKbCallout:
        (kind = 'tip') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { kind, title: '' }),
    }
  },
})

export const KbDetails = Node.create({
  name: 'kbDetails',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return { title: dataAttr('title', '') }
  },
  parseHTML() {
    return [{ tag: 'div[data-type="kb-details"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'kb-details' }), 0]
  },
  addNodeView() {
    return VueNodeViewRenderer(KbDetailsView, { stopEvent: stopFormEvents })
  },
  addKeyboardShortcuts() {
    return { Enter: () => exitOnEmptyLast(this.editor, this.name) }
  },
  addCommands() {
    return {
      setKbDetails:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name, { title: 'Section title' }),
    }
  },
})

function leafNode(name, type, attrs, view) {
  return Node.create({
    name,
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return Object.fromEntries(attrs.map((a) => [a, dataAttr(a, '')]))
    },
    parseHTML() {
      return [{ tag: `div[data-type="${type}"]` }]
    },
    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { 'data-type': type })]
    },
    addNodeView() {
      return VueNodeViewRenderer(view, { stopEvent: stopFormEvents })
    },
  })
}
export const KbVideo = leafNode('kbVideo', 'kb-video', ['src'], KbVideoView)
export const KbButton = leafNode('kbButton', 'kb-button', ['label', 'href'], KbButtonView)
export const KbFile = leafNode('kbFile', 'kb-file', ['asset', 'name'], KbFileView)

/** {{dc.key}}: shows the item's current value; `resolve(key)` → { title, value } | null. */
export const KbDc = Node.create({
  name: 'kbDc',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addOptions() {
    return { resolve: () => null }
  },
  addAttributes() {
    return { key: dataAttr('key', '') }
  },
  parseHTML() {
    return [{ tag: 'span[data-type="kb-dc"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'kb-dc' })]
  },
  addNodeView() {
    const resolve = this.options.resolve
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.className = 'kb-dc-chip'
      dom.dataset.key = node.attrs.key
      dom.contentEditable = 'false'
      const item = resolve(node.attrs.key)
      dom.textContent = item ? item.value || item.title : `{{dc.${node.attrs.key}}}`
      dom.title = item
        ? `Dynamic content: ${item.title} ({{dc.${node.attrs.key}}})`
        : `Unknown dynamic content: ${node.attrs.key}`
      if (!item) dom.classList.add('kb-dc-chip--missing')
      return { dom }
    }
  },
})

/** Images keep `kb-asset:<id>` in the document; the editor shows them through the desk's route. */
export const KbImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-kb-src') || el.getAttribute('src'),
        renderHTML: (attrs) => {
          const id = parseKbAssetRef(attrs.src)
          return { src: id ? kbAssetUrl(id) : attrs.src, 'data-kb-src': attrs.src }
        },
      },
    }
  },
}).configure({ inline: false, allowBase64: false })

/**
 * Type @ (or &) to link another article: a list of this knowledge base's
 * articles, filtered as you type; Enter inserts the title linked as
 * kb-article:<id>, which follows the article if its address changes.
 * `articles()` → [{ id, title, status, audience }].
 */
export const KbArticleLink = Extension.create({
  name: 'kbArticleLink',
  addOptions() {
    return { articles: async () => [], chars: ['@', '&'] }
  },
  addProseMirrorPlugins() {
    const options = this.options
    return options.chars.map((char) =>
      Suggestion({
        editor: this.editor,
        char,
        pluginKey: new PluginKey(`kbArticleLink${char.charCodeAt(0)}`),
        allowSpaces: true,
        items: async ({ query }) => {
          const q = query.trim().toLowerCase()
          const list = await options.articles()
          return list
            .filter((a) => !q || a.title.toLowerCase().includes(q))
            .sort((a, b) => a.title.localeCompare(b.title))
            .slice(0, 8)
        },
        command: ({ editor, range, props: a }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              {
                type: 'text',
                text: a.title,
                marks: [{ type: 'link', attrs: { href: kbArticleHref(a.id) } }],
              },
              { type: 'text', text: ' ' },
            ])
            .run()
        },
        render: () => {
          let component
          let popup
          return {
            onStart(props) {
              component = new VueRenderer(KbArticlePickList, { props, editor: props.editor })
              if (!props.clientRect) return
              popup = tippy('body', {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              })
            },
            onUpdate(props) {
              component?.updateProps(props)
              if (props.clientRect)
                popup?.[0]?.setProps({ getReferenceClientRect: props.clientRect })
            },
            onKeyDown(props) {
              if (props.event.key === 'Escape') {
                popup?.[0]?.hide()
                return true
              }
              return component?.ref?.onKeyDown(props) ?? false
            },
            onExit() {
              popup?.[0]?.destroy()
              component?.destroy()
            },
          }
        },
      }),
    )
  },
})
