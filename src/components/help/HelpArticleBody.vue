<script setup>
import { markdownToHtml } from '@/utils/markdown.js'
import { getCompanyPath } from '@/utils/routeHelpers.js'
import { useHelpContent } from '@/composables/useHelpContent.js'

/**
 * Renders a single help article's body (sanitized markdown via `markdownToHtml`)
 * with the shared `.help-prose` styling. Used by both the full Help page
 * (HelpArticleView) and the contextual HelpButton dialog. Intra-doc links were
 * rewritten to `/help/<slug>` at build time; clicks are intercepted for SPA nav.
 */
const props = defineProps({
  slug: { type: String, required: true },
  showDescription: { type: Boolean, default: true },
})

const { getArticle } = useHelpContent()
const router = useRouter()

const article = computed(() => getArticle(props.slug))
const bodyHtml = computed(() => (article.value ? markdownToHtml(article.value.body) : ''))

function onBodyClick(e) {
  const a = e.target.closest('a')
  if (!a) return
  const href = a.getAttribute('href') || ''
  if (href.startsWith('/help/') || href === '/help') {
    e.preventDefault()
    router.push(getCompanyPath(href))
  }
}
</script>

<template>
  <div v-if="article">
    <p v-if="showDescription && article.description" class="tw:text-secondary tw:mb-4">
      {{ article.description }}
    </p>
    <div class="help-prose tw:text-on-main" @click="onBodyClick" v-html="bodyHtml" />
  </div>
  <p v-else class="tw:text-sm tw:text-secondary">
    Help article “{{ slug }}” not found.
  </p>
</template>

<style scoped>
/* Shared prose styling for rendered help markdown. */
.help-prose :deep(h2) {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 1.75rem 0 0.5rem;
}
.help-prose :deep(h3) {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 1.25rem 0 0.4rem;
}
.help-prose :deep(p) {
  margin: 0.6rem 0;
  line-height: 1.7;
}
.help-prose :deep(ul),
.help-prose :deep(ol) {
  margin: 0.6rem 0;
  padding-left: 1.4rem;
  list-style: revert;
}
.help-prose :deep(li) {
  margin: 0.25rem 0;
}
.help-prose :deep(a) {
  color: var(--color-primary, #2563eb);
  text-decoration: underline;
}
/* Docusaurus-style callouts (:::note / :::tip / :::warning / :::caution).
   Tone drives the accent only — the title carries the meaning, so these stay
   readable if the colour is lost. */
.help-prose :deep(.admonition) {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  border-left: 3px solid var(--admonition-accent);
  border-radius: 0.375rem;
  background: color-mix(in srgb, var(--admonition-accent) 8%, transparent);
}
.help-prose :deep(.admonition-title) {
  margin: 0 0 0.25rem;
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--admonition-accent);
}
.help-prose :deep(.admonition > p:last-child) {
  margin-bottom: 0;
}
.help-prose :deep(.admonition-note) {
  --admonition-accent: var(--color-primary, #2563eb);
}
.help-prose :deep(.admonition-tip) {
  --admonition-accent: var(--color-good, #16a34a);
}
.help-prose :deep(.admonition-warning) {
  --admonition-accent: var(--color-warning, #d97706);
}
.help-prose :deep(.admonition-danger) {
  --admonition-accent: var(--color-bad, #dc2626);
}
.help-prose :deep(code) {
  font-size: 0.85em;
  background: var(--color-main-hover, #f1f5f9);
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
}
.help-prose :deep(pre) {
  background: var(--color-main-hover, #f1f5f9);
  padding: 0.9rem 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 0.8rem 0;
}
.help-prose :deep(pre code) {
  background: none;
  padding: 0;
}
.help-prose :deep(table) {
  border-collapse: collapse;
  margin: 0.8rem 0;
  width: 100%;
}
.help-prose :deep(th),
.help-prose :deep(td) {
  border: 1px solid var(--color-divider, #e2e8f0);
  padding: 0.45rem 0.7rem;
  text-align: left;
}
.help-prose :deep(blockquote) {
  border-left: 3px solid var(--color-divider, #e2e8f0);
  padding-left: 1rem;
  color: var(--color-secondary, #64748b);
  margin: 0.8rem 0;
}
</style>
