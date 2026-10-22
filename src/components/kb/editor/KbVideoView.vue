<script setup>
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { IconTrash, IconVideo } from '@tabler/icons-vue'
import { kbVideoEmbedUrl } from './kbMarkdownDoc.js'

// A video (::video{src="…"}): YouTube, Vimeo or Loom, played in the article.
const props = defineProps(nodeViewProps)
const embed = computed(() => kbVideoEmbedUrl(props.node.attrs.src))
</script>

<template>
  <NodeViewWrapper class="kb-embed" :class="{ 'kb-embed--selected': selected }" data-drag-handle>
    <div contenteditable="false">
      <div v-if="embed" class="kb-video-frame">
        <iframe
          :src="embed"
          title="Video"
          allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
          allowfullscreen
          loading="lazy"
          referrerpolicy="strict-origin-when-cross-origin"
        />
      </div>
      <div v-else class="kb-embed__empty">
        <IconVideo :size="20" />
        <span>Paste a YouTube, Vimeo or Loom link below.</span>
      </div>
      <div v-if="editor.isEditable" class="kb-embed__bar">
        <input
          :value="props.node.attrs.src"
          class="kb-embed__input"
          placeholder="https://www.youtube.com/watch?v=…"
          aria-label="Video link"
          @change="props.updateAttributes({ src: $event.target.value.trim() })"
        />
        <span v-if="props.node.attrs.src && !embed" class="kb-embed__error"
          >Not a YouTube, Vimeo or Loom link</span
        >
        <button
          type="button"
          class="kb-node-remove"
          aria-label="Remove video"
          @click="props.deleteNode()"
        >
          <IconTrash :size="14" />
        </button>
      </div>
    </div>
  </NodeViewWrapper>
</template>
