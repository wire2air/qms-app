<script setup>
import { IconUser, IconSparkles } from '@tabler/icons-vue'
import { markdownToHtml } from '@/utils/markdown.js'

const props = defineProps({
  item: { type: Object, required: true }, // { kind: 'user' | 'assistant', text, ... }
  // number → { entityType, id, to } built from the chat's tool results (ChatPanel),
  // used to linkify record identifiers in the assistant markdown.
  recordIndex: { type: Map, default: () => new Map() },
})

const router = useRouter()
const isUser = computed(() => props.item.kind === 'user')

// Wrap record identifiers (EV-…, NC-…, CAPA-…) that appear in the assistant
// markdown in links to their detail page. Runs AFTER markdownToHtml's DOMPurify
// pass and only inserts internal <a> elements pointing at app paths derived from
// the tool results — no user-controlled HTML, so no new XSS surface.
function linkifyRecords(html, index) {
  if (!index || index.size === 0) return html
  // Longest-first alternation with hyphen-aware boundaries so 'EV-000003' wins
  // and never partial-matches a longer token.
  const numbers = [...index.keys()].sort((a, b) => b.length - a.length)
  const escaped = numbers.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(?<![\\w-])(${escaped.join('|')})(?![\\w-])`, 'g')

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) {
    const n = walker.currentNode
    if (!n.parentElement?.closest('a')) nodes.push(n) // don't touch existing links
  }
  for (const node of nodes) {
    const text = node.nodeValue
    re.lastIndex = 0
    let m
    let last = 0
    let frag = null
    while ((m = re.exec(text)) !== null) {
      const ref = index.get(m[1])
      if (!ref) continue
      if (!frag) frag = doc.createDocumentFragment()
      if (m.index > last) frag.appendChild(doc.createTextNode(text.slice(last, m.index)))
      const a = doc.createElement('a')
      a.className = 'chat-record-link'
      a.setAttribute('href', ref.to)
      a.setAttribute('data-to', ref.to)
      a.textContent = m[1]
      frag.appendChild(a)
      last = m.index + m[1].length
    }
    if (frag) {
      if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)))
      node.parentNode.replaceChild(frag, node)
    }
  }
  return doc.body.innerHTML
}

// Render markdown only for assistant messages. The system prompt asks the model
// to format with markdown (tables especially); we never let assistant messages
// embed images (allowImages defaults to false). Record refs are then linkified.
const renderedHtml = computed(() => {
  if (isUser.value) return ''
  const html = markdownToHtml(props.item.text ?? '', { breaks: true })
  return linkifyRecords(html, props.recordIndex)
})

// Linkified record refs are real <a href> (middle-click / open-in-new-tab work);
// a left-click navigates in-app via the router instead of a full page load.
function onContentClick(e) {
  const a = e.target?.closest?.('a.chat-record-link')
  if (!a) return
  e.preventDefault()
  const to = a.getAttribute('data-to')
  if (to) router.push(to)
}
</script>

<template>
  <div class="tw:flex tw:gap-2.5 tw:items-start" :class="isUser ? 'tw:flex-row-reverse' : ''">
    <div
      class="tw:size-7 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:flex-none tw:mt-0.5"
      :class="isUser ? 'tw:bg-primary tw:text-white' : 'tw:bg-purple-100 tw:text-purple-700'"
    >
      <IconUser v-if="isUser" :size="14" />
      <IconSparkles v-else :size="14" />
    </div>

    <div
      v-if="isUser"
      class="tw:max-w-[85%] tw:rounded-2xl tw:px-3.5 tw:py-2 tw:text-sm tw:whitespace-pre-wrap tw:leading-relaxed tw:bg-primary tw:text-white tw:rounded-tr-sm"
    >
      {{ item.text }}
    </div>

    <div
      v-else
      class="chat-md tw:max-w-[85%] tw:rounded-2xl tw:px-3.5 tw:py-2 tw:text-sm tw:leading-relaxed tw:bg-main-hover tw:text-on-main tw:rounded-tl-sm"
      @click="onContentClick"
      v-html="renderedHtml"
    />
  </div>
</template>

<style>
/* v-html bypasses Vue's scoped CSS, so we scope to .chat-md manually. */
.chat-md > *:first-child {
  margin-top: 0;
}
.chat-md > *:last-child {
  margin-bottom: 0;
}
.chat-md p {
  margin: 0.5rem 0;
}
.chat-md h1,
.chat-md h2,
.chat-md h3,
.chat-md h4 {
  font-weight: 600;
  margin: 0.75rem 0 0.5rem;
  line-height: 1.3;
}
.chat-md h1 {
  font-size: 1.1rem;
}
.chat-md h2 {
  font-size: 1rem;
}
.chat-md h3 {
  font-size: 0.95rem;
}
.chat-md ul,
.chat-md ol {
  margin: 0.5rem 0;
  padding-left: 1.25rem;
}
.chat-md li {
  margin: 0.125rem 0;
}
.chat-md ul {
  list-style: disc;
}
.chat-md ol {
  list-style: decimal;
}
.chat-md code {
  background: rgba(0, 0, 0, 0.05);
  padding: 0.1rem 0.3rem;
  border-radius: 0.25rem;
  font-size: 0.85em;
}
.chat-md pre {
  background: rgba(0, 0, 0, 0.05);
  padding: 0.75rem;
  border-radius: 0.375rem;
  overflow-x: auto;
  margin: 0.5rem 0;
  font-size: 0.85em;
}
.chat-md pre code {
  background: transparent;
  padding: 0;
}
.chat-md table {
  border-collapse: collapse;
  margin: 0.5rem 0;
  font-size: 0.85em;
  width: 100%;
}
.chat-md th,
.chat-md td {
  border: 1px solid rgba(0, 0, 0, 0.1);
  padding: 0.35rem 0.5rem;
  text-align: left;
}
.chat-md th {
  background: rgba(0, 0, 0, 0.03);
  font-weight: 600;
}
.chat-md a {
  color: var(--color-primary, #2563eb);
  text-decoration: underline;
}
.chat-md a.chat-record-link {
  font-weight: 500;
  cursor: pointer;
}
.chat-md blockquote {
  border-left: 3px solid rgba(0, 0, 0, 0.15);
  padding-left: 0.75rem;
  color: rgb(100, 116, 139);
  margin: 0.5rem 0;
}
.chat-md strong {
  font-weight: 600;
}
.chat-md em {
  font-style: italic;
}
</style>
