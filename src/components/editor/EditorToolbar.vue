<script setup>
import {
  IconBold,
  IconItalic,
  IconStrikethrough,
  IconList,
  IconListNumbers,
  IconBlockquote,
  IconCode,
  IconLink,
  IconPhoto,
  IconCamera,
  IconTable,
  IconHighlight,
  IconH3,
  IconH4,
} from '@tabler/icons-vue'

const props = defineProps({
  editor: {
    type: Object,
    required: true,
  },
  imageUploading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggleLink', 'uploadImage'])

const toolbarItems = [
  { icon: IconBold, action: 'bold', label: 'Bold' },
  { icon: IconItalic, action: 'italic', label: 'Italic' },
  { icon: IconStrikethrough, action: 'strike', label: 'Strikethrough' },
  { divider: true },
  // Heading 3 / 4 — render as "N.1" / "N.1.1" under the parent section
  // number. Used for QMS sub-sections (the most common structure rule).
  { icon: IconH3, action: 'heading', level: 3, label: 'Sub-section (N.1)', custom: true },
  { icon: IconH4, action: 'heading', level: 4, label: 'Sub-sub-section (N.1.1)', custom: true },
  { divider: true },
  { icon: IconList, action: 'bulletList', label: 'Bullet List' },
  { icon: IconListNumbers, action: 'orderedList', label: 'Numbered List' },
  { divider: true },
  { icon: IconBlockquote, action: 'blockquote', label: 'Blockquote' },
  { icon: IconCode, action: 'code', label: 'Code' },
  { icon: IconLink, action: 'link', label: 'Link', custom: true },
  { divider: true },
  { icon: IconPhoto, action: 'image', label: 'Insert Image', custom: true },
  { icon: IconCamera, action: 'camera', label: 'Take Photo', custom: true },
  { divider: true },
  { icon: IconTable, action: 'table', label: 'Insert Table', custom: true },
  { divider: true },
  { icon: IconHighlight, action: 'highlight', label: 'Highlight' },
]

function executeCommand(item) {
  if (!props.editor) return

  if (item.custom && item.action === 'link') {
    emit('toggleLink')
    return
  }

  if (item.custom && item.action === 'image') {
    openImageFilePicker()
    return
  }

  if (item.custom && item.action === 'camera') {
    openCameraCapture()
    return
  }

  if (item.custom && item.action === 'table') {
    insertTable()
    return
  }

  if (item.custom && item.action === 'heading') {
    props.editor.chain().focus().toggleHeading({ level: item.level }).run()
    return
  }

  const command = `toggle${item.action.charAt(0).toUpperCase() + item.action.slice(1)}`
  props.editor.chain().focus()[command]().run()
}

function insertTable() {
  if (!props.editor) return

  props.editor
    .chain()
    .focus()
    .insertTable({
      rows: 3,
      cols: 3,
      withHeaderRow: true,
    })
    .run()
}

function openImageFilePicker() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = (e) => {
    const file = e.target.files?.[0]
    if (file) emit('uploadImage', file)
  }
  input.click()
}

// Take Photo — same upload pipeline, but `capture` hints the device camera
// (opens the camera on mobile; falls back to a file picker on desktop).
function openCameraCapture() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.capture = 'environment'
  input.onchange = (e) => {
    const file = e.target.files?.[0]
    if (file) emit('uploadImage', file)
  }
  input.click()
}

function isActive(item) {
  if (!props.editor) return false
  if (typeof item === 'string') return props.editor.isActive(item)
  if (item.action === 'heading') return props.editor.isActive('heading', { level: item.level })
  return props.editor.isActive(item.action)
}
</script>

<template>
  <div
    class="tw:flex tw:items-center tw:gap-1 tw:p-2 tw:bg-sidebar tw:border-b tw:border-divider tw:rounded-t"
  >
    <template v-for="(item, index) in toolbarItems" :key="index">
      <div v-if="item.divider" class="tw:w-px tw:h-5 tw:bg-divider tw:mx-0.5" />
      <button
        v-else
        :title="item.label"
        :disabled="item.action === 'image' && imageUploading"
        class="tw:min-w-8 tw:min-h-8 tw:rounded tw:transition-colors tw:border-0 tw:cursor-pointer tw:flex tw:items-center tw:justify-center tw:p-1"
        :class="
          isActive(item)
            ? 'tw:bg-primary tw:text-white'
            : 'tw:text-secondary tw:bg-transparent tw:hover:bg-main-hover tw:hover:text-on-main'
        "
        @click="executeCommand(item)"
      >
        <component
          :is="item.icon"
          v-if="item.action === 'image' && imageUploading"
          :size="18"
          class="tw:animate-spin"
        />
        <component :is="item.icon" v-else :size="18" />
      </button>
    </template>
  </div>
</template>
