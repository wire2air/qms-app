<script setup>
import { IconUser, IconSparkles } from '@tabler/icons-vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps({
  item: { type: Object, required: true }, // { kind: 'user' | 'assistant', text, ... }
})

const isUser = computed(() => props.item.kind === 'user')

// Render markdown only for assistant messages. The system prompt asks the
// model to format with markdown (tables especially), and trusting raw HTML
// from an LLM is unwise — sanitize with DOMPurify before injection.
const renderedHtml = computed(() => {
  if (isUser.value) return ''
  const text = props.item.text ?? ''
  if (!text) return ''
  const html = marked.parse(text, {
    breaks: true, // single newlines → <br>
    gfm: true,    // GitHub flavored — tables, fenced code, etc.
  })
  return DOMPurify.sanitize(html, {
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class', 'colspan', 'rowspan', 'align'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
  })
})
</script>

<template>
  <div
    class="tw:flex tw:gap-2.5 tw:items-start"
    :class="isUser ? 'tw:flex-row-reverse' : ''"
  >
    <div
      class="tw:size-7 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:flex-none tw:mt-0.5"
      :class="isUser
        ? 'tw:bg-primary tw:text-white'
        : 'tw:bg-purple-100 tw:text-purple-700'"
    >
      <IconUser v-if="isUser" :size="14" />
      <IconSparkles v-else :size="14" />
    </div>

    <div
      v-if="isUser"
      class="tw:max-w-[85%] tw:rounded-2xl tw:px-3.5 tw:py-2 tw:text-sm tw:whitespace-pre-wrap tw:leading-relaxed tw:bg-primary tw:text-white tw:rounded-tr-sm"
    >{{ item.text }}</div>

    <div
      v-else
      class="chat-md tw:max-w-[85%] tw:rounded-2xl tw:px-3.5 tw:py-2 tw:text-sm tw:leading-relaxed tw:bg-main-hover tw:text-on-main tw:rounded-tl-sm"
      v-html="renderedHtml"
    />
  </div>
</template>

<style>
/* v-html bypasses Vue's scoped CSS, so we scope to .chat-md manually. */
.chat-md > *:first-child { margin-top: 0; }
.chat-md > *:last-child { margin-bottom: 0; }
.chat-md p { margin: 0.5rem 0; }
.chat-md h1, .chat-md h2, .chat-md h3, .chat-md h4 {
  font-weight: 600;
  margin: 0.75rem 0 0.5rem;
  line-height: 1.3;
}
.chat-md h1 { font-size: 1.1rem; }
.chat-md h2 { font-size: 1rem; }
.chat-md h3 { font-size: 0.95rem; }
.chat-md ul, .chat-md ol { margin: 0.5rem 0; padding-left: 1.25rem; }
.chat-md li { margin: 0.125rem 0; }
.chat-md ul { list-style: disc; }
.chat-md ol { list-style: decimal; }
.chat-md code {
  background: rgba(0, 0, 0, 0.05);
  padding: 0.1rem 0.3rem;
  border-radius: 0.25rem;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace;
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
.chat-md pre code { background: transparent; padding: 0; }
.chat-md table {
  border-collapse: collapse;
  margin: 0.5rem 0;
  font-size: 0.85em;
  width: 100%;
}
.chat-md th, .chat-md td {
  border: 1px solid rgba(0, 0, 0, 0.1);
  padding: 0.35rem 0.5rem;
  text-align: left;
}
.chat-md th { background: rgba(0, 0, 0, 0.03); font-weight: 600; }
.chat-md a {
  color: var(--color-primary, #2563eb);
  text-decoration: underline;
}
.chat-md blockquote {
  border-left: 3px solid rgba(0, 0, 0, 0.15);
  padding-left: 0.75rem;
  color: rgb(100, 116, 139);
  margin: 0.5rem 0;
}
.chat-md strong { font-weight: 600; }
.chat-md em { font-style: italic; }
</style>
