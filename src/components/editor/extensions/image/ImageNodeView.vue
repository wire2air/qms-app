<script setup>
import { NodeViewWrapper } from '@tiptap/vue-3'
import { useImageResize } from './useImageResize.js'
import { normalizeAlignment } from './helpers.js'

const props = defineProps({
  node: { type: Object, required: true },
  updateAttributes: { type: Function, required: true },
  deleteNode: { type: Function, required: true },
  selected: { type: Boolean, default: false },
  editor: { type: Object, required: true },
  getPos: { type: Function, default: null },
})

const imgEl = ref(null)
const captionEl = ref(null)
const naturalSize = ref({ width: 0, height: 0 })
const previewSize = ref(null)
const errored = ref(false)
const loaded = ref(false)

const editable = computed(() => props.editor.isEditable)
const alignment = computed(() => normalizeAlignment(props.node.attrs.alignment))
const storedWidth = computed(() => props.node.attrs.width)
const storedHeight = computed(() => props.node.attrs.height)

// previewSize wins during a drag — falls back to attrs once committed/cancelled.
const displayWidth = computed(() => previewSize.value?.width ?? storedWidth.value)
const displayHeight = computed(() => previewSize.value?.height ?? storedHeight.value)

const caption = computed(() => props.node.attrs.caption)
const hasCaption = computed(() => caption.value !== null && caption.value !== undefined)

const { isResizing, start: startResize } = useImageResize({
  minWidth: 80,
  maxWidth: 1600,
  getNaturalSize: () => naturalSize.value,
  onPreview: (w, h) => {
    if (w == null) {
      previewSize.value = null
      return
    }
    previewSize.value = { width: w, height: h }
  },
  onCommit: (w, h) => {
    previewSize.value = null
    props.updateAttributes({ width: w, ...(h ? { height: h } : {}) })
  },
})

const frameStyle = computed(() => {
  if (alignment.value === 'full') {
    return { width: '100%', maxWidth: '100%' }
  }
  if (displayWidth.value) {
    return { width: `${displayWidth.value}px`, maxWidth: '100%' }
  }
  return { maxWidth: '100%' }
})

function onImageLoad(event) {
  const t = event.currentTarget
  naturalSize.value = { width: t.naturalWidth, height: t.naturalHeight }
  loaded.value = true
  errored.value = false
}

function onImageError() {
  errored.value = true
  loaded.value = false
}

function selectNode(event) {
  // Clicking the figure should select the node — PM handles this for atom
  // nodes natively, but make sure we don't lose the selection if the click
  // landed on a non-img descendant.
  if (!editable.value) return
  if (event.target.closest('.tiptap-image-nv__caption')) return
  if (event.target.closest('.tiptap-image-nv__handle')) return
  if (typeof props.getPos === 'function') {
    const pos = props.getPos()
    if (typeof pos === 'number') {
      props.editor.chain().setNodeSelection(pos).run()
    }
  }
}

function onCaptionInput(event) {
  // contenteditable: the caption is stored in attrs. We do not let PM manage
  // the cursor here (atom node), and we keep the DOM as source of truth during
  // typing — committing the value back to attrs on each input. PM-side this
  // produces a tiny replaceWith-attrs transaction, which collapses nicely
  // into the undo stack.
  props.updateAttributes({ caption: event.target.textContent })
}

function onCaptionKeydown(event) {
  // Enter: finish editing (no newline inside caption)
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    event.target.blur()
    return
  }
  // Backspace on empty caption: remove it (toggle off) rather than deleting node
  if (event.key === 'Backspace' && !event.target.textContent) {
    event.preventDefault()
    props.updateAttributes({ caption: null })
    nextTick(() => props.editor.commands.focus())
    return
  }
  // Don't let PM intercept keystrokes — we want native contenteditable behavior
  event.stopPropagation()
}

function onCaptionPaste(event) {
  // Strip rich content from pasted captions — plain text only.
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, text)
}

// Keyboard delete when image is selected: PM handles this via atom-node
// behavior; nothing for us to do.
</script>

<template>
  <NodeViewWrapper
    as="figure"
    class="tiptap-image-nv"
    :class="[
      `tiptap-image-nv--align-${alignment}`,
      selected ? 'tiptap-image-nv--selected' : '',
      isResizing ? 'tiptap-image-nv--resizing' : '',
      !loaded && !errored ? 'tiptap-image-nv--loading' : '',
    ]"
    :data-alignment="alignment"
    :data-drag-handle="editable ? '' : null"
    @mousedown="selectNode"
  >
    <div class="tiptap-image-nv__frame" :style="frameStyle">
      <img
        ref="imgEl"
        :src="node.attrs.src"
        :alt="node.attrs.alt || ''"
        :title="node.attrs.title || ''"
        :loading="node.attrs.loading || 'lazy'"
        :width="displayWidth || undefined"
        :height="displayHeight || undefined"
        :data-id="node.attrs.dataId || null"
        class="tiptap-image-nv__img"
        draggable="false"
        @load="onImageLoad"
        @error="onImageError"
      />

      <div
        v-if="!loaded && !errored"
        class="tiptap-image-nv__loading"
        aria-hidden="true"
      >
        <span class="tiptap-image-nv__spinner" />
      </div>

      <div v-if="errored" class="tiptap-image-nv__error" role="alert">
        <span>Failed to load image</span>
        <button
          v-if="editable"
          type="button"
          class="tiptap-image-nv__error-action"
          @click="deleteNode"
        >
          Remove
        </button>
      </div>

      <template v-if="editable && selected && !errored">
        <button
          type="button"
          aria-label="Resize from left edge"
          class="tiptap-image-nv__handle tiptap-image-nv__handle--w"
          @pointerdown="(e) => startResize(e, 'w', imgEl)"
        />
        <button
          type="button"
          aria-label="Resize from right edge"
          class="tiptap-image-nv__handle tiptap-image-nv__handle--e"
          @pointerdown="(e) => startResize(e, 'e', imgEl)"
        />
        <button
          type="button"
          aria-label="Resize from bottom-left corner"
          class="tiptap-image-nv__handle tiptap-image-nv__handle--sw"
          @pointerdown="(e) => startResize(e, 'sw', imgEl)"
        />
        <button
          type="button"
          aria-label="Resize from bottom-right corner"
          class="tiptap-image-nv__handle tiptap-image-nv__handle--se"
          @pointerdown="(e) => startResize(e, 'se', imgEl)"
        />
      </template>

      <div
        v-if="editable && selected && displayWidth"
        class="tiptap-image-nv__size-badge"
        aria-hidden="true"
      >
        {{ displayWidth }} × {{ displayHeight || '?' }}
      </div>
    </div>

    <figcaption
      v-if="hasCaption"
      ref="captionEl"
      class="tiptap-image-nv__caption"
      :contenteditable="editable"
      spellcheck="true"
      data-placeholder="Add a caption…"
      @input="onCaptionInput"
      @keydown="onCaptionKeydown"
      @paste="onCaptionPaste"
      @mousedown.stop
      @click.stop
    >{{ caption }}</figcaption>
  </NodeViewWrapper>
</template>

<style lang="scss">
/* Global (un-scoped) — image styles must apply to both editor and read-only
   rendered HTML, and we use namespaced class names to avoid leakage. */
.tiptap-image-nv {
  position: relative;
  margin: 1rem 0;
  display: block;
  max-width: 100%;
  line-height: 1.4;

  &--align-left {
    float: left;
    margin: 0.25rem 1.25rem 0.5rem 0;
    max-width: 60%;
  }

  &--align-right {
    float: right;
    margin: 0.25rem 0 0.5rem 1.25rem;
    max-width: 60%;
  }

  &--align-center {
    margin-left: auto;
    margin-right: auto;
    text-align: center;
  }

  &--align-full {
    width: 100%;
    margin-left: 0;
    margin-right: 0;
    clear: both;
  }

  &__frame {
    position: relative;
    display: inline-block;
    max-width: 100%;
    line-height: 0;
  }

  &--align-center &__frame {
    display: block;
    margin-left: auto;
    margin-right: auto;
  }

  &--align-full &__frame {
    display: block;
    width: 100%;
  }

  &__img {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    user-select: none;
    -webkit-user-drag: none;
    -webkit-touch-callout: none;
  }

  &--selected &__frame::after {
    content: '';
    position: absolute;
    inset: -3px;
    border: 2px solid var(--primary);
    border-radius: 8px;
    pointer-events: none;
    z-index: 1;
  }

  &--resizing {
    user-select: none;
  }

  &--resizing &__img {
    pointer-events: none;
  }

  &--loading &__img {
    opacity: 0.4;
    transition: opacity 0.2s;
  }

  &__loading,
  &__error {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    pointer-events: none;
  }

  &__error {
    background: rgba(244, 67, 54, 0.08);
    color: #b91c1c;
    border-radius: 6px;
    font-size: 0.875rem;
    pointer-events: auto;
    flex-direction: column;
  }

  &__error-action {
    background: transparent;
    border: 1px solid currentColor;
    color: inherit;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 600;
  }

  &__spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(0, 0, 0, 0.1);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: tiptap-image-spin 0.7s linear infinite;
  }

  &__handle {
    position: absolute;
    width: 12px;
    height: 12px;
    background: var(--primary);
    border: 2px solid #fff;
    border-radius: 50%;
    padding: 0;
    z-index: 3;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
    transition: transform 0.1s;
    touch-action: none; /* mobile: stop browser from scrolling on drag */

    &:hover {
      transform: scale(1.15);
    }

    &:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }

    &--w {
      left: -7px;
      top: 50%;
      transform: translateY(-50%);
      cursor: ew-resize;

      &:hover { transform: translateY(-50%) scale(1.15); }
    }
    &--e {
      right: -7px;
      top: 50%;
      transform: translateY(-50%);
      cursor: ew-resize;

      &:hover { transform: translateY(-50%) scale(1.15); }
    }
    &--sw { left: -7px; bottom: -7px; cursor: nesw-resize; }
    &--se { right: -7px; bottom: -7px; cursor: nwse-resize; }
  }

  &__size-badge {
    position: absolute;
    bottom: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    font-size: 0.6875rem;
    font-weight: 600;
    pointer-events: none;
    z-index: 2;
    white-space: nowrap;
  }

  &__caption {
    display: block;
    margin-top: 0.5rem;
    padding: 0 0.5rem;
    font-size: 0.875rem;
    color: var(--q-secondary, #6b7280);
    text-align: center;
    outline: none;
    min-height: 1.25em;
    border-radius: 3px;

    &:focus { background: rgba(0, 0, 0, 0.02); }

    &:empty::before {
      content: attr(data-placeholder);
      color: var(--q-secondary, #9ca3af);
      opacity: 0.6;
      pointer-events: none;
    }
  }
}

/* Upload placeholder shown via ProseMirror Decoration.widget */
.tiptap-image-placeholder {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  background: rgba(0, 0, 0, 0.04);
  border: 1px dashed rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0.25rem 0;
  user-select: none;

  &__spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: tiptap-image-spin 0.8s linear infinite;
  }
}

@keyframes tiptap-image-spin {
  to { transform: rotate(360deg); }
}

/* Mobile touch tuning: handles must be bigger and hit-target friendly. */
@media (pointer: coarse) {
  .tiptap-image-nv__handle {
    width: 20px;
    height: 20px;

    &--w { left: -11px; }
    &--e { right: -11px; }
    &--sw { left: -11px; bottom: -11px; }
    &--se { right: -11px; bottom: -11px; }
  }
}
</style>
