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
  'hoistChildren',
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

// ── Keyboard reorder (WCAG 2.1.1) ───────────────────────────────────────────
// The grip on every card is a real <button>: it takes focus and announces
// itself as an action. Until now its only handler was `@click.stop`, so a
// keyboard user reached a control that advertised a capability it did not
// have — worse than an unreachable grip, because the dead end is only found
// after trying.
//
// This MIRRORS `src/composables/useListReorder.js` (its onKeydown / moveItem /
// refocus / live-region design) rather than importing it: that composable
// supports only handle/filter/draggable/onEnd/announce, while this canvas
// needs `group` + `onAdd` + the ghost/chosen/drag classes for CROSS-CONTAINER
// drags (palette → canvas, canvas → a layout field's children). Swapping to it
// would trade this defect for the loss of every cross-container drag, so the
// raw `useSortable` above keeps the mouse path and this adds the keyboard one
// beside it.
//
// SCOPE: within-container reorder only. Moving a field BETWEEN containers by
// keyboard (out of a section, into a row) is deliberately NOT implemented —
// that is a new capability, not an accessibility fix, and it needs a target
// picker of its own. Mouse drag remains the only cross-container path.

const KEY_STEP = { ArrowUp: -1, ArrowDown: 1, Home: 'first', End: 'last' }

let liveRegionEl = null
function liveRegion() {
  if (liveRegionEl) return liveRegionEl
  liveRegionEl = document.createElement('div')
  liveRegionEl.setAttribute('aria-live', 'polite')
  liveRegionEl.setAttribute('aria-atomic', 'true')
  // Inline rather than a utility class: this node is appended to <body>,
  // outside this component's scoped styles, so a visually-hidden helper that
  // stopped applying would leave the announcement visible in the corner.
  liveRegionEl.style.cssText =
    'position:absolute;width:1px;height:1px;margin:-1px;padding:0;' +
    'overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;'
  document.body.appendChild(liveRegionEl)
  return liveRegionEl
}

function fieldLabel(field) {
  return field?.label || field?.name || field?.type || 'Field'
}

function onCanvasKeydown(e) {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  const step = KEY_STEP[e.key]
  if (step === undefined) return
  // Only the grip drives a reorder. Without this, arrows typed into a card's
  // in-place label editor would move the card instead of the caret.
  if (!e.target?.closest?.('.drag-handle')) return

  const container = canvasRef.value
  if (!container) return

  // `props.fields` IS the array the sortable above mutates (useSortable was
  // handed this same reference), and it is the host's reactive `schema` — both
  // FormBuilder and MiniFormBuilder persist through a `watch(schema, …,
  // { deep: true })`, so splicing it here saves exactly like a mouse drag.
  const list = props.fields
  if (!Array.isArray(list) || list.length < 2) return

  const items = Array.from(container.children)
  const item = items.find((el) => el.contains(e.target))
  if (!item) return

  const from = items.indexOf(item)
  if (from < 0 || from >= list.length) return
  const to = step === 'first' ? 0 : step === 'last' ? list.length - 1 : from + step
  if (to < 0 || to >= list.length) return // already at the end — let the key be

  e.preventDefault()
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)

  liveRegion().textContent = `${fieldLabel(moved)} moved to position ${to + 1} of ${list.length}.`
  refocusGrip(to)
}

// Keep the grip focused after the list re-renders, so a run of presses keeps
// moving the SAME field instead of dropping focus to <body> after the first.
async function refocusGrip(index) {
  await nextTick()
  const container = canvasRef.value
  if (!container) return
  const grip = Array.from(container.children)[index]?.querySelector('.drag-handle')
  if (grip && typeof grip.focus === 'function') grip.focus()
}

onBeforeUnmount(() => {
  liveRegionEl?.remove()
  liveRegionEl = null
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
    @keydown="onCanvasKeydown"
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
      @hoistChildren="(p) => emit('hoistChildren', p)"
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
