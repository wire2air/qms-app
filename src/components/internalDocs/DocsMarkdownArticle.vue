<script setup>
/**
 * Renders one internal doc's markdown. Pipeline:
 *   raw markdown → rewriteDocLinks (SPA/GitHub targets) → markdownToHtml
 *   (marked + DOMPurify chokepoint) → v-html → DOM enhancement pass.
 *
 * The enhancement pass runs on the live DOM (the sanitizer strips id/button
 * attributes, so we add them after render): heading anchor ids + copy-link
 * buttons, table scroll wrappers, per-<pre> copy buttons, target=_blank on
 * external links. Emits the table of contents for the ToC rail.
 */
import { markdownToHtml } from '@/utils/markdown.js'
import { rewriteDocLinks } from '@/utils/internalDocsLinks.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'

const props = defineProps({
  docId: { type: String, required: true },
})

const emit = defineEmits(['toc'])

const { loadDoc } = useInternalDocs()
const router = useRouter()
const route = useRoute()
const toast = useToast()

const content = ref(null)
const loadError = ref(null)
const bodyEl = ref(null)

const bodyHtml = computed(() =>
  content.value ? markdownToHtml(rewriteDocLinks(content.value, props.docId)) : '',
)

watch(
  () => props.docId,
  async (id) => {
    content.value = null
    loadError.value = null
    try {
      const doc = await loadDoc(id)
      if (id === props.docId) content.value = doc.content
    } catch (err) {
      if (id === props.docId) loadError.value = err
    }
  },
  { immediate: true },
)

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

function enhance(root) {
  const toc = []
  const used = new Set()

  root.querySelectorAll('h2, h3').forEach((h) => {
    let id = slugify(h.textContent) || 'section'
    while (used.has(id)) id = `${id}-x`
    used.add(id)
    h.id = id
    toc.push({ id, text: h.textContent.trim(), depth: h.tagName === 'H2' ? 2 : 3 })

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'docs-anchor'
    btn.title = 'Copy link to section'
    btn.setAttribute('aria-label', `Copy link to section ${h.textContent.trim()}`)
    btn.dataset.anchor = id
    btn.textContent = '#'
    h.appendChild(btn)
  })

  root.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('docs-table-wrap')) return
    const wrap = document.createElement('div')
    wrap.className = 'docs-table-wrap'
    table.parentNode.insertBefore(wrap, table)
    wrap.appendChild(table)
  })

  root.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.docs-copy')) return
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'docs-copy'
    btn.setAttribute('aria-label', 'Copy code block')
    btn.textContent = 'Copy'
    pre.appendChild(btn)
  })

  root.querySelectorAll('a[href^="http"]').forEach((a) => {
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
  })

  emit('toc', toc)
}

watch(bodyHtml, async (html) => {
  if (!html) {
    emit('toc', [])
    return
  }
  await nextTick()
  if (!bodyEl.value) return
  enhance(bodyEl.value)
  if (route.hash) scrollToId(route.hash.slice(1))
})

function scrollToId(id) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(message)
  } catch {
    toast.error('Could not copy to clipboard')
  }
}

function onBodyClick(e) {
  const anchorBtn = e.target.closest('.docs-anchor')
  if (anchorBtn) {
    const id = anchorBtn.dataset.anchor
    const url = `${location.origin}${route.path}#${id}`
    copyText(url, 'Section link copied')
    return
  }

  const copyBtn = e.target.closest('.docs-copy')
  if (copyBtn) {
    // marked always renders fences as pre > code; the button is a sibling of
    // code inside pre, so code.textContent is exactly the fence content.
    const code = copyBtn.closest('pre')?.querySelector('code')
    copyText(code?.textContent ?? '', 'Code copied')
    return
  }

  const a = e.target.closest('a')
  if (!a) return
  const href = a.getAttribute('href') || ''
  if (href.startsWith('#')) {
    e.preventDefault()
    scrollToId(href.slice(1))
    history.replaceState(history.state, '', `${route.path}${href}`)
    return
  }
  if (href.startsWith('/docs')) {
    e.preventDefault()
    router.push(getCompanyPath(href))
  }
}

defineExpose({ scrollToId })
</script>

<template>
  <div v-if="loadError" class="tw:flex tw:flex-col tw:items-start tw:gap-3 tw:py-8">
    <p class="tw:text-secondary">Could not load this document.</p>
  </div>
  <div v-else-if="!content" class="tw:flex tw:justify-center tw:py-16">
    <BaseSpinner />
  </div>
  <div
    v-else
    ref="bodyEl"
    class="docs-prose tw:text-on-main"
    @click="onBodyClick"
    v-html="bodyHtml"
  />
</template>

<style scoped>
/* Prose styling for the docs corpus — table-first and monospace-faithful.
   Mirrors .help-prose (HelpArticleBody) with additions for h1, wide tables,
   ASCII diagrams, anchors and copy buttons. */
.docs-prose {
  line-height: 1.7;
  max-width: 76ch;
}
.docs-prose :deep(h1) {
  font-size: 1.6rem;
  font-weight: 700;
  margin: 0 0 0.75rem;
  line-height: 1.3;
}
.docs-prose :deep(h2) {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 2rem 0 0.5rem;
  scroll-margin-top: 90px;
}
.docs-prose :deep(h3) {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 1.4rem 0 0.4rem;
  scroll-margin-top: 90px;
}
.docs-prose :deep(p) {
  margin: 0.6rem 0;
}
.docs-prose :deep(ul),
.docs-prose :deep(ol) {
  margin: 0.6rem 0;
  padding-left: 1.4rem;
  list-style: revert;
}
.docs-prose :deep(li) {
  margin: 0.25rem 0;
}
.docs-prose :deep(a) {
  color: var(--color-primary, #2563eb);
  text-decoration: underline;
}
.docs-prose :deep(code) {
  font-size: 0.85em;
  background: var(--color-main-hover, #f1f5f9);
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
}
/* ASCII diagrams live in plain fences — never wrap them. */
.docs-prose :deep(pre) {
  position: relative;
  background: var(--color-main-hover, #f1f5f9);
  padding: 0.9rem 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 0.8rem 0;
  white-space: pre;
}
.docs-prose :deep(pre code) {
  background: none;
  padding: 0;
}
/* Wide matrices scroll inside their own container — the page never scrolls
   sideways. The wrapper is injected by the enhancement pass. */
.docs-prose :deep(.docs-table-wrap) {
  overflow-x: auto;
  margin: 0.8rem 0;
  border: 1px solid var(--color-divider, #e2e8f0);
  border-radius: 0.5rem;
}
.docs-prose :deep(table) {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.875rem;
}
.docs-prose :deep(th),
.docs-prose :deep(td) {
  border: 1px solid var(--color-divider, #e2e8f0);
  padding: 0.45rem 0.7rem;
  text-align: left;
  vertical-align: top;
}
.docs-prose :deep(th) {
  background: var(--color-main-hover, #f1f5f9);
  white-space: nowrap;
}
.docs-prose :deep(blockquote) {
  border-left: 3px solid var(--color-primary, #2563eb);
  padding: 0.1rem 0 0.1rem 1rem;
  color: var(--color-secondary, #64748b);
  margin: 0.8rem 0;
}
.docs-prose :deep(hr) {
  border: none;
  border-top: 1px solid var(--color-divider, #e2e8f0);
  margin: 1.5rem 0;
}
.docs-prose :deep(.docs-anchor) {
  margin-left: 0.4rem;
  color: var(--color-secondary, #64748b);
  opacity: 0;
  transition: opacity 0.15s;
  font-weight: 400;
  cursor: pointer;
}
.docs-prose :deep(h2:hover .docs-anchor),
.docs-prose :deep(h3:hover .docs-anchor) {
  opacity: 1;
}
.docs-prose :deep(.docs-copy) {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 0.3rem;
  border: 1px solid var(--color-divider, #e2e8f0);
  background: var(--color-card, #fff);
  color: var(--color-secondary, #64748b);
  opacity: 0;
  transition: opacity 0.15s;
  cursor: pointer;
}
.docs-prose :deep(pre:hover .docs-copy) {
  opacity: 1;
}
</style>
