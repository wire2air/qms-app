<script setup>
import { markdownToHtml } from '@/utils/markdown.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useValidationContent } from '@/composables/useValidationContent.js'

/**
 * Renders one validation document's body (sanitized markdown via
 * `markdownToHtml`). Shared by the on-screen reader and the print view, so a
 * protocol looks the same executed on paper as it does on screen.
 *
 * Prose styling differs from `.help-prose` in one way that matters: protocols
 * are mostly wide test-step tables with blank Actual Result / Pass-Fail /
 * Initials columns. Those get fixed minimum widths and `break-inside: avoid`
 * so a step never splits across a page, and the blank columns stay wide enough
 * to write in.
 */
const props = defineProps({
  slug: { type: String, required: true },
  /** Print view drops the on-screen link interception and tightens spacing. */
  forPrint: { type: Boolean, default: false },
})

const { getArticle } = useValidationContent()
const router = useRouter()

const article = computed(() => getArticle(props.slug))
const bodyHtml = computed(() => (article.value ? markdownToHtml(article.value.body) : ''))

function onBodyClick(e) {
  if (props.forPrint) return
  const a = e.target.closest('a')
  if (!a) return
  const href = a.getAttribute('href') || ''
  if (href.startsWith('/validation/') || href === '/validation') {
    e.preventDefault()
    router.push(getCompanyPath(href))
  }
}
</script>

<template>
  <div v-if="article">
    <div
      class="vp-prose"
      :class="forPrint ? 'vp-print' : 'tw:text-on-main'"
      @click="onBodyClick"
      v-html="bodyHtml"
    />
  </div>
  <p v-else class="tw:text-sm tw:text-secondary">Validation document “{{ slug }}” not found.</p>
</template>

<style scoped>
.vp-prose :deep(h1) {
  font-size: 1.4rem;
  font-weight: 700;
  margin: 0 0 0.75rem;
}
.vp-prose :deep(h2) {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 1.75rem 0 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--color-divider, #e2e8f0);
}
.vp-prose :deep(h3) {
  font-size: 1rem;
  font-weight: 600;
  margin: 1.25rem 0 0.4rem;
}
.vp-prose :deep(h4) {
  font-size: 0.9rem;
  font-weight: 600;
  margin: 1rem 0 0.3rem;
}
.vp-prose :deep(p) {
  margin: 0.6rem 0;
  line-height: 1.65;
}
.vp-prose :deep(ul),
.vp-prose :deep(ol) {
  margin: 0.6rem 0;
  padding-left: 1.4rem;
  list-style: revert;
}
.vp-prose :deep(li) {
  margin: 0.25rem 0;
}
.vp-prose :deep(a) {
  color: var(--color-primary, #2563eb);
  text-decoration: underline;
}
.vp-prose :deep(code) {
  font-size: 0.85em;
  background: var(--color-main-hover, #f1f5f9);
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
}
.vp-prose :deep(blockquote) {
  border-left: 3px solid var(--color-divider, #e2e8f0);
  padding: 0.1rem 0 0.1rem 1rem;
  color: var(--color-secondary, #64748b);
  margin: 0.8rem 0;
}
.vp-prose :deep(hr) {
  border: 0;
  border-top: 1px solid var(--color-divider, #e2e8f0);
  margin: 1.5rem 0;
}

/* ── Tables ────────────────────────────────────────────────────────────────
   Test-step tables are the substance of a protocol. They must survive both a
   narrow screen (scroll) and a printer (no split rows). */
.vp-prose :deep(table) {
  border-collapse: collapse;
  margin: 0.8rem 0;
  width: 100%;
  font-size: 0.86rem;
}
.vp-prose :deep(th),
.vp-prose :deep(td) {
  border: 1px solid var(--color-divider, #cbd5e1);
  padding: 0.4rem 0.6rem;
  text-align: left;
  vertical-align: top;
}
.vp-prose :deep(th) {
  background: var(--color-main-hover, #f1f5f9);
  font-weight: 600;
}
/* An empty cell is an execution field — give it room to be written in. */
.vp-prose :deep(td:empty) {
  min-width: 5.5rem;
  height: 2.1rem;
}
.vp-prose :deep(tr) {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* ── Print ─────────────────────────────────────────────────────────────────
   PrintLayout owns the page chrome; this only tunes the document body. */
.vp-print :deep(h2) {
  font-size: 12.5pt;
  margin: 14pt 0 4pt;
  break-after: avoid;
  page-break-after: avoid;
}
.vp-print :deep(h3) {
  font-size: 11pt;
  break-after: avoid;
  page-break-after: avoid;
}
.vp-print :deep(p),
.vp-print :deep(li) {
  font-size: 10pt;
  line-height: 1.45;
}
.vp-print :deep(table) {
  font-size: 8.5pt;
}
.vp-print :deep(th),
.vp-print :deep(td) {
  border: 1px solid #9ca3af;
  padding: 3pt 5pt;
}
.vp-print :deep(td:empty) {
  height: 22pt;
}
</style>
