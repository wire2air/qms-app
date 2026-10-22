<script setup>
import { NodeViewWrapper, NodeViewContent, nodeViewProps } from '@tiptap/vue-3'
import { IconChevronRight, IconTrash } from '@tabler/icons-vue'

// A collapsible section (:::details Title … :::). Readers open it on the help
// center; here it can be folded to tidy the editor (not saved).
const props = defineProps(nodeViewProps)
const open = ref(true)
</script>

<template>
  <NodeViewWrapper class="kb-details" :class="{ 'kb-details--closed': !open }">
    <div class="kb-details__head" contenteditable="false">
      <button
        type="button"
        class="kb-details__toggle"
        :aria-expanded="open"
        :aria-label="open ? 'Fold section' : 'Unfold section'"
        @click="open = !open"
      >
        <IconChevronRight :size="16" :class="{ 'tw:rotate-90': open }" />
      </button>
      <input
        v-if="editor.isEditable"
        :value="props.node.attrs.title"
        class="kb-details__title"
        placeholder="Section title (what readers click to open it)"
        aria-label="Section title"
        maxlength="160"
        @input="props.updateAttributes({ title: $event.target.value })"
      />
      <span v-else class="kb-details__title">{{ props.node.attrs.title }}</span>
      <button
        v-if="editor.isEditable"
        type="button"
        class="kb-node-remove"
        aria-label="Remove section"
        title="Remove section"
        @click="props.deleteNode()"
      >
        <IconTrash :size="14" />
      </button>
    </div>
    <NodeViewContent v-show="open" class="kb-details__body" />
  </NodeViewWrapper>
</template>
