<script setup>
/**
 * BaseMarkdown — render a markdown string as sanitized, prose-styled HTML.
 * Wraps the project's single-source-of-truth `markdownToHtml` (marked +
 * DOMPurify) so consumers stop hand-rolling `<div v-html>` with drifting
 * sanitize configs (the exact problem markdown.js was created to prevent).
 *
 *   <BaseMarkdown :content="doc.description" />
 *   <BaseMarkdown :content="comment.body" breaks />   <!-- soft line breaks -->
 *
 * Output is DOMPurify-sanitized, so v-html here is safe.
 */
import { markdownToHtml } from '@/utils/markdown.js'

const props = defineProps({
  content: { type: String, default: '' },
  // Treat single newlines as <br> (chat/comment style).
  breaks: { type: Boolean, default: false },
  // Allow <img> through the sanitizer (default off).
  allowImages: { type: Boolean, default: false },
})

const html = computed(() =>
  markdownToHtml(props.content, { breaks: props.breaks, allowImages: props.allowImages }),
)
</script>

<template>
  <div class="tw:prose tw:dark:prose-invert tw:prose-sm tw:max-w-none tw:text-on-main" v-html="html"></div>
</template>
