<script setup>
/**
 * Field-level wrapper around BaseRichTextEditor that standardises how a
 * rich-text value is shown and edited, so every place behaves the same:
 *
 *   • editable = false       → read-only HTML (or the `emptyLabel`, default "—").
 *   • clickToEdit = false     → (DEFAULT) always-on editor when editable.
 *   • clickToEdit = true      → collapsed, clickable `clickToEditLabel` until
 *                               clicked; the editor opens in place and collapses
 *                               back on blur.
 *
 * "Empty" is detected by stripping tags/whitespace, so a rich-text value left as
 * "<p></p>" still falls back to the label/placeholder instead of an invisible,
 * un-clickable block (the click-to-edit disappearing-field bug).
 *
 * The heavy tiptap editor is only mounted when actually editing — collapsed /
 * read-only fields just render HTML, so a page full of them stays light.
 */
const props = defineProps({
  // Whether the value can be edited at all. When false → read-only view.
  editable: { type: Boolean, default: true },
  // Collapsed click-to-edit affordance instead of an always-visible editor.
  clickToEdit: { type: Boolean, default: false },
  // Label on the collapsed click-to-edit row while the field is empty.
  clickToEditLabel: { type: String, default: 'Add a description…' },
  // Placeholder shown inside the editor itself.
  placeholder: { type: String, default: 'Start typing…' },
  // Shown read-only (not editable) when there's no content.
  emptyLabel: { type: String, default: '—' },
  contentType: { type: String, default: 'html' },
  // Text styling for the read-only / collapsed content + label.
  textClass: { type: String, default: 'tw:text-sm tw:text-secondary tw:leading-relaxed' },
})

const model = defineModel({ type: [String, Object], default: '' })

const editing = ref(false)

// Rich-text "empty" check — strips tags/&nbsp;/whitespace so leftover markup
// (e.g. "<p></p>", "<br>") counts as empty. Non-string (JSON) content is
// treated as present when truthy.
function hasRichText(value) {
  if (typeof value !== 'string') return !!value
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ').trim().length > 0
}
const hasContent = computed(() => hasRichText(model.value))

// Show the editor when editable AND either not in click-to-edit mode (always-on)
// or the user has clicked into a click-to-edit field.
const showEditor = computed(() => props.editable && (!props.clickToEdit || editing.value))
</script>

<template>
  <div>
    <BaseRichTextEditor
      v-if="showEditor"
      v-model="model"
      :editable="true"
      :placeholder="placeholder"
      :contentType="contentType"
      @blur="clickToEdit && (editing = false)"
    >
      <template v-if="$slots['toolbar-extra']" #toolbar-extra="scope">
        <slot name="toolbar-extra" v-bind="scope" />
      </template>
    </BaseRichTextEditor>

    <!-- Collapsed click-to-edit view (editable) -->
    <BaseClickableRow
      v-else-if="editable && clickToEdit"
      :aria-label="clickToEditLabel"
      @click="editing = true"
    >
      <div
        v-if="hasContent"
        class="tw:prose tw:dark:prose-invert tw:max-w-none tw:hover:text-primary"
        :class="textClass"
        v-html="model"
      />
      <p v-else class="tw:hover:text-primary" :class="textClass">{{ clickToEditLabel }}</p>
    </BaseClickableRow>

    <!-- Read-only view (not editable) -->
    <template v-else>
      <div v-if="hasContent" class="tw:prose tw:dark:prose-invert tw:max-w-none" :class="textClass" v-html="model" />
      <p v-else :class="textClass">{{ emptyLabel }}</p>
    </template>
  </div>
</template>

<style scoped>
/* Cap inline-edit editors so a long value scrolls instead of pushing the page. */
:deep(.rich-text-editor-content) {
  max-height: 12rem;
  overflow-y: auto;
}
</style>
