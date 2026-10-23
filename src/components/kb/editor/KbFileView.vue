<script setup>
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { IconPaperclip, IconTrash, IconDownload } from '@tabler/icons-vue'
import { kbAssetUrl } from '../kbMarkdown.js'

// A downloadable file (::file[Name]{asset="<id>"}), stored in this knowledge base.
const props = defineProps(nodeViewProps)
</script>

<template>
  <NodeViewWrapper
    class="kb-embed kb-file-node"
    :class="{ 'kb-embed--selected': selected }"
    data-drag-handle
  >
    <div contenteditable="false" class="kb-file-row">
      <IconPaperclip :size="16" class="tw:shrink-0 tw:text-secondary" />
      <input
        v-if="editor.isEditable"
        :value="props.node.attrs.name"
        class="kb-embed__input kb-file-name"
        aria-label="File name shown to readers"
        maxlength="200"
        @input="props.updateAttributes({ name: $event.target.value })"
      />
      <span v-else class="kb-file-name">{{ props.node.attrs.name }}</span>
      <a
        v-if="props.node.attrs.asset"
        :href="kbAssetUrl(props.node.attrs.asset)"
        class="kb-node-remove"
        aria-label="Download"
        title="Download"
        target="_blank"
        rel="noopener"
        ><IconDownload :size="14"
      /></a>
      <button
        v-if="editor.isEditable"
        type="button"
        class="kb-node-remove"
        aria-label="Remove file"
        @click="props.deleteNode()"
      >
        <IconTrash :size="14" />
      </button>
    </div>
  </NodeViewWrapper>
</template>
