<script setup>
import { TOOLBAR_ITEMS, visibleToolbarItems } from './editorToolbarItems.js'

const props = defineProps({
  editor: {
    type: Object,
    required: true,
  },
  imageUploading: {
    type: Boolean,
    default: false,
  },
  /**
   * 'auto'      — full toolbar, narrowed to the essentials on a phone
   * 'full'      — never narrow (a desk-bound authoring surface on a small window)
   * 'essential' — always narrow
   */
  density: {
    type: String,
    default: 'auto',
    validator: (v) => ['auto', 'full', 'essential'].includes(v),
  },
})

const emit = defineEmits(['toggleLink', 'uploadImage', 'takePhoto'])

// 640px, not the app's usual 1280px desktop breakpoint: this splits PHONE from
// tablet, and an iPad in portrait (768px) has room for the full toolbar. The
// sidebar's 1280px line answers a different question — whether the nav can sit
// inline — and reusing it here would strip tools from every iPad.
const isPhoneWidth = useMediaQuery('(max-width: 639px)')

const compact = computed(() => {
  if (props.density === 'essential') return true
  if (props.density === 'full') return false
  return isPhoneWidth.value
})

const toolbarItems = computed(() => visibleToolbarItems(compact.value, TOOLBAR_ITEMS))

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
    emit('takePhoto')
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

function isActive(item) {
  if (!props.editor) return false
  if (typeof item === 'string') return props.editor.isActive(item)
  if (item.action === 'heading') return props.editor.isActive('heading', { level: item.level })
  return props.editor.isActive(item.action)
}
</script>

<template>
  <!-- px only, no py: the buttons already carry min-h-8, so vertical padding
       only made the band taller without making it more legible — and a taller
       band is what made the toolbar out-weigh the writing area. Horizontal
       padding stays so the first button is not flush against the wrapper's
       rounded border.

       The bottom border is the ONLY separation here, deliberately: the
       toolbar's tw:bg-sidebar is the same colour the wrapper already paints,
       so it contributes nothing and the rule does all the work. -->
  <div
    class="tw:flex tw:flex-wrap tw:items-center tw:gap-1 tw:px-1 tw:bg-sidebar tw:border-b tw:border-divider tw:rounded-t"
  >
    <!-- Keyed on identity, not index: the list changes when the viewport
         crosses the phone breakpoint, and index keys would let Vue reuse a
         button for a different tool across that swap. -->
    <template
      v-for="(item, index) in toolbarItems"
      :key="item.divider ? `divider-${index}` : `${item.action}-${item.level ?? ''}`"
    >
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
    <!-- Injected sidecar tools (e.g. voice-to-text), pushed to the right. -->
    <div class="tw:ml-auto tw:flex tw:items-center tw:gap-1"><slot /></div>
  </div>
</template>
