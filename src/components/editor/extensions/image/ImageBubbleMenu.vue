<script setup>
import {
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconArrowAutofitWidth,
  IconTextCaption,
  IconLetterA,
  IconReplace,
  IconCrop,
  IconTrash,
  IconCopy,
  IconExternalLink,
} from '@tabler/icons-vue'
import { BubbleMenu } from '@tiptap/vue-3/menus'

const props = defineProps({
  editor: { type: Object, required: true },
})

const emit = defineEmits(['replace', 'crop'])

const toast = useToast()

const showAltEditor = ref(false)
const altDraft = ref('')

const imageAttrs = computed(() => props.editor.getAttributes('image') || {})
const alignment = computed(() => imageAttrs.value.alignment || 'center')
const hasCaption = computed(() => {
  const c = imageAttrs.value.caption
  return c !== null && c !== undefined
})

function shouldShow({ editor }) {
  // Show only when the image node is the current selection. We rely on
  // editor.isActive('image') which is true for a NodeSelection on the image.
  //
  // isEditable is checked here rather than by v-if'ing this component away in
  // a read-only editor — a BubbleMenu must never be unmounted mid-life (see
  // BaseRichTextEditor.vue's BubbleMenu comment). A custom shouldShow replaces
  // TipTap's default, which is what would otherwise apply this check.
  return editor.isEditable && editor.isActive('image')
}

function align(value) {
  props.editor.chain().focus().setImageAlignment(value).run()
}

function setWidthPct(pct) {
  const view = props.editor.view
  const editorWidth = view.dom?.clientWidth || 800
  const w = Math.round((editorWidth * pct) / 100)
  props.editor.chain().focus().setImageWidth(w).run()
}

function toggleCaption() {
  props.editor.chain().focus().toggleImageCaption().run()
}

function startAltEdit() {
  altDraft.value = imageAttrs.value.alt || ''
  showAltEditor.value = true
}

function commitAlt() {
  props.editor.chain().focus().setImageAlt(altDraft.value).run()
  showAltEditor.value = false
}

function removeImage() {
  props.editor.chain().focus().deleteSelection().run()
}

async function copyUrl() {
  const src = imageAttrs.value.src
  if (!src) return
  try {
    await navigator.clipboard.writeText(src)
    toast.success('Image URL copied')
  } catch {
    toast.error('Failed to copy URL')
  }
}

function openInNewTab() {
  const src = imageAttrs.value.src
  if (!src) return
  // noopener prevents window.opener access; noreferrer prevents Referer header.
  window.open(src, '_blank', 'noopener,noreferrer')
}

function replaceImage() {
  emit('replace')
}

function cropImage() {
  emit('crop')
}

const alignButtons = computed(() => [
  { icon: IconAlignLeft, label: 'Align left (⌘⇧L)', value: 'left' },
  { icon: IconAlignCenter, label: 'Align center (⌘⇧E)', value: 'center' },
  { icon: IconAlignRight, label: 'Align right (⌘⇧R)', value: 'right' },
  { icon: IconArrowAutofitWidth, label: 'Full width (⌘⇧F)', value: 'full' },
])

const widthPresets = [25, 50, 75, 100]
</script>

<template>
  <!-- `options` is TipTap v3's Floating UI config. (v3 dropped tippy.js, so a
       `tippyOptions` prop is not a prop at all — it silently fell through to
       $attrs and was rendered onto the div as an attribute.) -->
  <BubbleMenu
    pluginKey="image-bubble-menu"
    :editor="editor"
    :shouldShow="shouldShow"
    :options="{ placement: 'top' }"
  >
    <div
      class="tw:flex tw:items-center tw:gap-1 tw:p-1 tw:bg-white tw:rounded-lg tw:shadow-xl tw:border tw:border-divider"
      role="toolbar"
      aria-label="Image options"
    >
      <template v-if="showAltEditor">
        <BaseTextInput
          v-model="altDraft"
          placeholder="Alt text for accessibility"
          class="tw:min-w-64!"
          autofocus
          @keydown.enter.prevent="commitAlt"
          @keydown.escape.prevent="showAltEditor = false"
        />
        <button
          type="button"
          class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:bg-primary tw:text-white tw:border-0 tw:cursor-pointer"
          aria-label="Save alt text"
          @click="commitAlt"
        >
          ✓
        </button>
        <button
          type="button"
          class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:text-secondary tw:bg-transparent tw:border-0 tw:cursor-pointer tw:hover:bg-sidebar"
          aria-label="Cancel"
          @click="showAltEditor = false"
        >
          ✕
        </button>
      </template>

      <template v-else>
        <!-- Alignment -->
        <button
          v-for="b in alignButtons"
          :key="b.value"
          type="button"
          class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:transition-colors tw:border-0 tw:cursor-pointer"
          :class="
            alignment === b.value
              ? 'tw:bg-primary tw:text-white'
              : 'tw:text-secondary tw:bg-transparent tw:hover:bg-sidebar tw:hover:text-on-sidebar'
          "
          :title="b.label"
          :aria-label="b.label"
          :aria-pressed="alignment === b.value"
          @click="align(b.value)"
        >
          <component :is="b.icon" :size="18" />
        </button>

        <div class="tw:w-px tw:h-5 tw:bg-divider tw:mx-0.5" />

        <!-- Width presets -->
        <button
          v-for="pct in widthPresets"
          :key="pct"
          type="button"
          class="tw:px-2 tw:min-w-8 tw:h-8 tw:rounded tw:text-xs tw:font-semibold tw:transition-colors tw:border-0 tw:cursor-pointer tw:bg-transparent tw:text-secondary tw:hover:bg-sidebar tw:hover:text-on-sidebar"
          :title="`Set width to ${pct}%`"
          :aria-label="`Set width to ${pct}%`"
          @click="setWidthPct(pct)"
        >
          {{ pct }}%
        </button>

        <div class="tw:w-px tw:h-5 tw:bg-divider tw:mx-0.5" />

        <!-- Caption toggle -->
        <button
          type="button"
          class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:transition-colors tw:border-0 tw:cursor-pointer"
          :class="
            hasCaption
              ? 'tw:bg-primary tw:text-white'
              : 'tw:text-secondary tw:bg-transparent tw:hover:bg-sidebar tw:hover:text-on-sidebar'
          "
          :title="hasCaption ? 'Remove caption' : 'Add caption'"
          :aria-label="hasCaption ? 'Remove caption' : 'Add caption'"
          :aria-pressed="hasCaption"
          @click="toggleCaption"
        >
          <IconTextCaption :size="18" />
        </button>

        <!-- Alt text -->
        <button
          type="button"
          class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:transition-colors tw:border-0 tw:cursor-pointer tw:text-secondary tw:bg-transparent tw:hover:bg-sidebar tw:hover:text-on-sidebar"
          title="Edit alt text"
          aria-label="Edit alt text"
          @click="startAltEdit"
        >
          <IconLetterA :size="18" />
        </button>

        <!-- Replace -->
        <button
          type="button"
          class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:transition-colors tw:border-0 tw:cursor-pointer tw:text-secondary tw:bg-transparent tw:hover:bg-sidebar tw:hover:text-on-sidebar"
          title="Replace image"
          aria-label="Replace image"
          @click="replaceImage"
        >
          <IconReplace :size="18" />
        </button>

        <!-- Crop -->
        <button
          type="button"
          class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:transition-colors tw:border-0 tw:cursor-pointer tw:text-secondary tw:bg-transparent tw:hover:bg-sidebar tw:hover:text-on-sidebar"
          title="Crop image"
          aria-label="Crop image"
          @click="cropImage"
        >
          <IconCrop :size="18" />
        </button>

        <div class="tw:w-px tw:h-5 tw:bg-divider tw:mx-0.5" />

        <!-- Copy URL -->
        <button
          type="button"
          class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:transition-colors tw:border-0 tw:cursor-pointer tw:text-secondary tw:bg-transparent tw:hover:bg-sidebar tw:hover:text-on-sidebar"
          title="Copy image URL"
          aria-label="Copy image URL"
          @click="copyUrl"
        >
          <IconCopy :size="18" />
        </button>

        <!-- Open in new tab -->
        <button
          type="button"
          class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:transition-colors tw:border-0 tw:cursor-pointer tw:text-secondary tw:bg-transparent tw:hover:bg-sidebar tw:hover:text-on-sidebar"
          title="Open image in new tab"
          aria-label="Open image in new tab"
          @click="openInNewTab"
        >
          <IconExternalLink :size="18" />
        </button>

        <div class="tw:w-px tw:h-5 tw:bg-divider tw:mx-0.5" />

        <!-- Remove -->
        <button
          type="button"
          class="tw:flex tw:items-center tw:justify-center tw:size-8 tw:rounded tw:transition-colors tw:border-0 tw:cursor-pointer tw:text-red-500 tw:bg-transparent tw:hover:bg-red-50"
          title="Remove image"
          aria-label="Remove image"
          @click="removeImage"
        >
          <IconTrash :size="18" />
        </button>
      </template>
    </div>
  </BubbleMenu>
</template>
