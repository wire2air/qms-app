<script setup>
import { IconCirclePlus, IconPlus } from '@tabler/icons-vue'
import { useSortable } from '@vueuse/integrations/useSortable'
import FormCanvasField from './FormCanvasField.vue'
import AddFieldDialog from './AddFieldDialog.vue'

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
  // SortableJS group name. Defaults to the shared 'form-fields' group so the
  // full builder's palette can drop into this canvas. Hosts that mount SEVERAL
  // canvases on one page (the workflow builder expands every step at once)
  // pass a UNIQUE name per canvas — otherwise a field could be dragged out of
  // one step's form and into another's, which neither array would record.
  group: {
    type: String,
    default: 'form-fields',
  },
  // The dashed frame reads as "drop zone here" in the full builder, where the
  // canvas sits beside a palette. Embedded hosts that already have their own
  // container (a workflow step's panel) turn it off — a box inside a box just
  // adds a line (user request 2026-08-15).
  bordered: {
    type: Boolean,
    default: true,
  },
  // Empty-state copy. The default names the palette, which only exists in the
  // full builder — embedded hosts add fields their own way and say so.
  emptyDescription: {
    type: String,
    default: 'Drag fields from the sidebar or click to add.',
  },
  // The trailing Add-field button. MiniFormBuilder turns it off — it renders
  // its own (same picker, its own placement).
  showAddButton: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits([
  'addField',
  'selectField',
  'configureField',
  'changeFieldKind',
  'removeField',
  'duplicateField',
  'moveField',
])

const canvasRef = ref(null)

// Initialize sortable for the main canvas
useSortable(canvasRef, props.fields, {
  group: {
    name: props.group,
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

function onConfigureField(path) {
  emit('configureField', path)
}

function onChangeKind(payload) {
  emit('changeFieldKind', payload.path, payload.kindId)
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

// ── Click-to-insert (user request 2026-08-26) ───────────────────────────────
// Dropping a drag exactly in the gap is fiddly; every card carries an
// "insert above" chip and the canvas ends with an Add-field button. Both open
// the same picker the MiniFormBuilder uses, then add at the remembered spot.
const showAddDialog = ref(false)
const pendingInsert = ref(null) // { parentPath, index } | null = append at end

function onInsertField(payload) {
  pendingInsert.value = payload
  showAddDialog.value = true
}

function openAppendDialog() {
  pendingInsert.value = { parentPath: null, index: props.fields.length }
  showAddDialog.value = true
}

function onPickType(type) {
  const target = pendingInsert.value ?? { parentPath: null, index: props.fields.length }
  emit('addField', type, target.parentPath, target.index)
  pendingInsert.value = null
}
</script>

<template>
  <div
    ref="canvasRef"
    class="tw:flex-1 tw:min-h-100 tw:transition-all tw:duration-200 tw:overflow-y-auto tw:flex tw:flex-wrap tw:content-start tw:gap-4"
    :class="{
      'tw:bg-sidebar tw:border-2 tw:border-dashed tw:border-divider tw:rounded-2xl tw:p-5':
        bordered,
      'tw:border-primary tw:bg-primary/50': bordered && isDragging,
      'tw:items-center tw:justify-center': fields.length === 0,
    }"
  >
    <BaseEmptyState
      v-if="fields.length === 0"
      :icon="IconCirclePlus"
      title="Start Building"
      :description="emptyDescription"
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
      :group="group"
      @select="onSelectField"
      @configure="onConfigureField"
      @changeKind="onChangeKind"
      @remove="onRemoveField"
      @duplicate="onDuplicateField"
      @moveField="onMoveField"
      @addField="onAddField"
      @insertField="onInsertField"
    />
  </div>

  <!-- After the last element, like the flow builder's Add Step — OUTSIDE the
       sortable container so it never enters SortableJS's index math. -->
  <button
    v-if="showAddButton"
    type="button"
    class="tw:mt-3 tw:flex tw:w-full tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:border-2 tw:border-dashed tw:border-divider tw:py-2.5 tw:text-secondary tw:transition-colors tw:hover:border-primary tw:hover:text-primary"
    @click="openAppendDialog"
  >
    <IconPlus :size="18" />
    <span class="tw:text-sm tw:font-bold">Add field</span>
  </button>

  <AddFieldDialog v-model="showAddDialog" @pick="onPickType" />
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
