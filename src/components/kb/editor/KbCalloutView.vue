<script setup>
import { NodeViewWrapper, NodeViewContent, nodeViewProps } from '@tiptap/vue-3'
import {
  IconInfoCircle,
  IconBulb,
  IconAlertTriangle,
  IconAlertOctagon,
  IconNote,
  IconTrash,
} from '@tabler/icons-vue'
import { CALLOUT_KINDS, CALLOUT_LABELS } from './kbMarkdownDoc.js'

// A callout (:::tip Title … :::). Header: its kind and an optional title.
const props = defineProps(nodeViewProps)
const ICONS = {
  note: IconNote,
  info: IconInfoCircle,
  tip: IconBulb,
  warning: IconAlertTriangle,
  caution: IconAlertTriangle,
  danger: IconAlertOctagon,
}
const kind = computed(() =>
  CALLOUT_KINDS.includes(props.node.attrs.kind) ? props.node.attrs.kind : 'note',
)
function set(attrs) {
  props.updateAttributes(attrs)
}
</script>

<template>
  <NodeViewWrapper :class="['kb-callout', `kb-callout--${kind}`]" data-drag-handle>
    <div class="kb-callout__head" contenteditable="false">
      <component :is="ICONS[kind]" :size="16" class="kb-callout__icon" />
      <select
        v-if="editor.isEditable"
        :value="kind"
        class="kb-callout__kind"
        aria-label="Callout type"
        @change="set({ kind: $event.target.value })"
      >
        <option v-for="k in CALLOUT_KINDS" :key="k" :value="k">{{ CALLOUT_LABELS[k] }}</option>
      </select>
      <input
        v-if="editor.isEditable"
        :value="node.attrs.title"
        class="kb-callout__title"
        :placeholder="`${CALLOUT_LABELS[kind]} (title, optional)`"
        aria-label="Callout title"
        maxlength="120"
        @input="set({ title: $event.target.value })"
      />
      <span v-else class="kb-callout__title">{{ node.attrs.title || CALLOUT_LABELS[kind] }}</span>
      <button
        v-if="editor.isEditable"
        type="button"
        class="kb-node-remove"
        aria-label="Remove callout"
        title="Remove callout (keeps nothing)"
        @click="deleteNode()"
      >
        <IconTrash :size="14" />
      </button>
    </div>
    <NodeViewContent class="kb-callout__body" />
  </NodeViewWrapper>
</template>
