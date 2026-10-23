<script setup>
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { IconTrash } from '@tabler/icons-vue'
import { kbArticleHref, parseKbArticleHref } from './kbMarkdownDoc.js'

// A call-to-action button (::button[Label]{href="…"}): a web address, an
// email (mailto:), a phone number (tel:) or another article.
const props = defineProps(nodeViewProps)
const articles = ref([])
const pickerExt = computed(() =>
  props.editor.extensionManager.extensions.find((e) => e.name === 'kbArticleLink'),
)
async function loadArticles() {
  if (articles.value.length || !pickerExt.value) return
  articles.value = (await pickerExt.value.options.articles()).sort((a, b) =>
    a.title.localeCompare(b.title),
  )
}
const linkedArticle = computed(() => parseKbArticleHref(props.node.attrs.href)?.articleId || '')
const linkedTitle = computed(
  () => articles.value.find((a) => a.id === linkedArticle.value)?.title || '',
)
onMounted(() => {
  if (linkedArticle.value) loadArticles()
})
const valid = computed(() => {
  const h = String(props.node.attrs.href || '')
  return !h || /^(https?:\/\/|mailto:|tel:|#|kb-article:)/i.test(h)
})
</script>

<template>
  <NodeViewWrapper class="kb-embed" :class="{ 'kb-embed--selected': selected }" data-drag-handle>
    <div contenteditable="false">
      <p class="kb-button-preview">
        <span class="kb-button">{{ props.node.attrs.label || 'Button' }}</span>
        <span v-if="!editor.isEditable" class="kb-embed__hint">{{
          linkedTitle || props.node.attrs.href
        }}</span>
      </p>
      <div v-if="editor.isEditable" class="kb-embed__bar kb-embed__bar--wrap">
        <input
          :value="props.node.attrs.label"
          class="kb-embed__input kb-embed__input--short"
          placeholder="Button text"
          aria-label="Button text"
          maxlength="80"
          @input="props.updateAttributes({ label: $event.target.value })"
        />
        <input
          :value="linkedArticle ? '' : props.node.attrs.href"
          class="kb-embed__input"
          :placeholder="
            linkedArticle
              ? `Links to: ${linkedTitle || 'an article'}`
              : 'https://… · mailto:… · tel:…'
          "
          aria-label="Button link"
          @change="props.updateAttributes({ href: $event.target.value.trim() })"
        />
        <select
          class="kb-embed__input kb-embed__input--short"
          :value="linkedArticle"
          aria-label="Or link an article"
          @focus="loadArticles"
          @change="
            props.updateAttributes({
              href: $event.target.value ? kbArticleHref($event.target.value) : '',
            })
          "
        >
          <option value="">Or an article…</option>
          <option v-for="a in articles" :key="a.id" :value="a.id">{{ a.title }}</option>
        </select>
        <button
          type="button"
          class="kb-node-remove"
          aria-label="Remove button"
          @click="props.deleteNode()"
        >
          <IconTrash :size="14" />
        </button>
      </div>
      <p v-if="!valid" class="kb-embed__error">
        A link starts with https://, mailto:, tel: or # (or pick an article).
      </p>
    </div>
  </NodeViewWrapper>
</template>
