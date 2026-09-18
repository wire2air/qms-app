<script setup>
import PrintLayout from '../PrintLayout.vue'
import { useValidationContent } from '@/composables/useValidationContent.js'

/**
 * Print one validation document — a qualification protocol, the VMP, the Part
 * 11 assessment, a PQ template.
 *
 * These are printed to be EXECUTED: a tester works down the steps on paper,
 * records actual results, and signs. So the printout carries the company
 * header (it becomes the customer's controlled record, not ours), and the
 * signature blocks come from the document body itself rather than from the
 * system — nothing here has been electronically signed, and rendering a
 * signature table that looked as if it had would be misleading.
 *
 * `showAudit` is off for the same reason: PrintLayout's audit/signature
 * sections read the audit trail of a stored record, and a protocol is static
 * content shipped with the app, not a record in the customer's workspace.
 *
 * Reached via the central dispatcher:
 *   /<companyCode>/print?module=ValidationProtocol&slug=oq/document-control
 */
const props = defineProps({
  slug: { type: String, default: '' },
})

const { getArticle } = useValidationContent()

const article = computed(() => getArticle(props.slug))

// Protocol id for the footer — the document declares it in frontmatter
// keywords is unreliable, so fall back to a slug-derived identifier.
const identifier = computed(() => {
  const a = article.value
  if (!a) return 'Validation document'
  return a.title
})
</script>

<template>
  <PrintLayout
    v-if="article"
    status="PROTOCOL"
    :identifier="identifier"
    :showAudit="false"
    defaultOrientation="landscape"
  >
    <template #title>
      <h1 class="vp-title">{{ article.title }}</h1>
      <p v-if="article.description" class="vp-subtitle">{{ article.description }}</p>
    </template>

    <ValidationArticleBody :slug="slug" forPrint />
  </PrintLayout>

  <div v-else class="tw:p-8 tw:text-sm tw:text-secondary">
    Validation document “{{ slug }}” not found.
  </div>
</template>

<style scoped>
.vp-title {
  font-size: 17pt;
  font-weight: 700;
  margin: 0 0 4pt;
}
.vp-subtitle {
  font-size: 10pt;
  color: #4b5563;
  margin: 0;
}
</style>
