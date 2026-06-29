<script setup>
import { IconCirclePlus } from '@tabler/icons-vue'
import { useSortable } from '@vueuse/integrations/useSortable'
import FormCanvasField from './FormCanvasField.vue'

const props = defineProps({
  fields: {
    type: Array,
    default: () => [],
  },
  selectedPath: {
    type: String,
    default: null,
  },
  isDragging: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['addField', 'selectField', 'removeField', 'duplicateField', 'moveField'])

const canvasRef = ref(null)

// Initialize sortable for the main canvas
useSortable(canvasRef, props.fields, {
  group: {
    name: 'form-fields',
    pull: true,
    put: true,
  },
  animation: 150,
  handle: '.drag-handle',
  ghostClass: 'sortable-ghost',
  chosenClass: 'sortable-chosen',
  dragClass: 'sortable-drag',
  // Pointer-based drag — cards embed real inputs (live component preview) that
  // break native HTML5 DnD. Kept consistent across the 'form-fields' group.
  forceFallback: true,
  fallbackOnBody: true,
  swapThreshold: 0.65,
  onAdd(evt) {
    // New field from palette
    const fieldType = evt.item.dataset.fieldType
    if (fieldType) {
      // Remove the cloned DOM element
      evt.item.remove()
      emit('addField', fieldType, null, evt.newIndex)
    }
  },
})

function onSelectField(path) {
  emit('selectField', path)
}

function onRemoveField(path) {
  emit('removeField', path)
}

function onDuplicateField(path) {
  emit('duplicateField', path)
}

function onMoveField(payload) {
  emit('moveField', payload.fromPath, payload.toPath, payload.toIndex)
}

function onAddField(payload) {
  emit('addField', payload.fieldType, payload.parentPath, payload.index)
}
</script>

<template>
  <div
    ref="canvasRef"
    class="tw:flex-1 tw:min-h-100 tw:bg-sidebar tw:border-2 tw:border-dashed tw:border-divider tw:rounded-2xl tw:p-5 tw:transition-all tw:duration-200 tw:overflow-y-auto tw:flex tw:flex-wrap tw:content-start tw:gap-4"
    :class="{
      'tw:border-primary tw:bg-primary/50': isDragging,
      'tw:items-center tw:justify-center': fields.length === 0,
    }"
  >
    <BaseEmptyState
      v-if="fields.length === 0"
      :icon="IconCirclePlus"
      title="Start Building"
      description="Drag fields from the sidebar or click to add."
      :dense="true"
      data-no-sortable="true"
    />

    <FormCanvasField
      v-for="(field, index) in fields"
      :key="field.name || index"
      :field="field"
      :path="String(index)"
      :isSelected="selectedPath === String(index)"
      :selectedPath="selectedPath"
      :isDragging="isDragging"
      @select="onSelectField"
      @remove="onRemoveField"
      @duplicate="onDuplicateField"
      @moveField="onMoveField"
      @addField="onAddField"
    />
  </div>
</template>

<style lang="scss" scoped>
// SortableJS classes
:deep(.sortable-ghost) {
  background: var(--tw-primary);
  border: 2px solid var(--tw-primary);
}

:deep(.sortable-chosen) {
  background: var(--tw-main-selected);
}

:deep(.sortable-drag) {
  background: white;
  box-shadow:
    0 20px 25px -5px rgb(0 0 0 / 0.1),
    0 8px 10px -6px rgb(0 0 0 / 0.1);
  border-radius: 12px;
}
</style>
