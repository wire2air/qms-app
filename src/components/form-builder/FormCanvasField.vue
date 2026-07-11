<script setup>
import { IconCopy, IconTrash, IconGripVertical, IconCirclePlus, IconInfoCircle } from '@tabler/icons-vue'
import { useSortable } from '@vueuse/integrations/useSortable'
import { FIELD_WIDTHS, FIELD_TYPES } from '@/constants/formBuilderConfig'
import DynamicForm from '@/components/form/DynamicForm.js'

const props = defineProps({
  field: {
    type: Object,
    required: true,
  },
  path: {
    type: String,
    required: true,
  },
  isSelected: {
    type: Boolean,
    default: false,
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

const emit = defineEmits(['select', 'remove', 'duplicate', 'moveField', 'addField'])

const childrenDropzoneRef = ref(null)

// Click-to-edit for a layout container's title (section/row/column), which is
// the only place a container's label surfaces now that leaf fields render
// WYSIWYG with no chrome header.
const editingLabel = ref(false)
// Click-to-edit for an Instructions block's rich-text content, in place.
const editingInstructions = ref(false)
// Click-to-edit for a Header field's heading + subheading, in place. The
// size/align classes mirror DynamicForm's live header render.
const editingHeading = ref(false)
const editingSubheading = ref(false)
const headerSizeClass = computed(
  () =>
    ({ default: 'tw:text-xl', large: 'tw:text-3xl', small: 'tw:text-base' })[
      props.field.size || 'large'
    ] || 'tw:text-3xl',
)
const headerAlignClass = computed(
  () =>
    ({ left: 'tw:text-left', center: 'tw:text-center', right: 'tw:text-right' })[
      props.field.align || 'center'
    ] || 'tw:text-center',
)

const LAYOUT_TYPES = new Set(['section', 'row', 'column', 'repeater'])

const isLayoutField = computed(() => LAYOUT_TYPES.has(props.field.type))

// An Input Table is a repeater flagged with widget: 'inputTable'. It's edited by
// its columns (not nested drop zones), so it gets its own builder card instead
// of the raw repeater header + dropzone.
const isInputTable = computed(() => props.field.widget === 'inputTable')

// Built-in purpose text for the field type, shown in the card's info tooltip.
const fieldDescription = computed(() =>
  isInputTable.value
    ? FIELD_TYPES.inputTable?.description
    : FIELD_TYPES[props.field.type]?.description,
)

// A short type label for the container's slim header (e.g. "Section").
const layoutTypeLabel = computed(
  () => props.field.type.charAt(0).toUpperCase() + props.field.type.slice(1),
)

const hasChildren = computed(() => Boolean(props.field.children || props.field.template))

const children = computed(() => props.field.children || props.field.template || [])

const childrenKey = computed(() => (props.field.template ? 'template' : 'children'))

// The builder lays cards out in a single column for reliable drag-and-drop;
// the rendered form (and the Preview panel) pack fields side-by-side by width.
// Show a small badge for any non-full width so the author still sees it here.
const widthLabel = computed(() => {
  const w = FIELD_WIDTHS.find((x) => x.value === (props.field.width || 'full'))
  return w && w.value !== 'full' ? w.label : null
})

// flex-basis per width so cards pack side-by-side in the flex-wrap canvas,
// exactly like the rendered form. The gap (gap-4 = 1rem) is subtracted per
// item so a full row of same-width cards fits: e.g. two halves =
// 2 × (50% - 0.5rem) + 1rem gap = 100%.
const WIDTH_BASIS = {
  full: '100%',
  half: 'calc(50% - 0.5rem)',
  third: 'calc(33.3333% - 0.6667rem)',
  quarter: 'calc(25% - 0.75rem)',
}
const cardWidthStyle = computed(() => {
  // Every card needs an explicit basis: a flex-row item with no basis shrinks to
  // its content width, so 'full' must be set to 100% too (it doesn't auto-stretch
  // the way it did in the old flex-col layout).
  const basis = WIDTH_BASIS[props.field.width || 'full'] || '100%'
  return { flex: `0 0 ${basis}`, maxWidth: basis }
})

// Render the field's real component in the card (like the live preview) instead
// of a generic placeholder. Force width to full so the component fills the card
// — the card itself already carries the field's width at the canvas-grid level.
// hidden:false so a "Hide field" field still renders in the builder card (it's
// only hidden on the live form); the card shows a "Hidden" badge instead.
// label:'' so DynamicForm doesn't render the field's own label — the card
// renders a click-to-edit label above it instead (see the leaf-field branch),
// giving every field the same in-place label editing as the special ones.
const previewFields = computed(() => [
  { ...props.field, width: 'full', hidden: false, label: '' },
])

// Leaf fields (not display-only separators) get an editable label on the card.
const showEditableLabel = computed(() => props.field.type !== 'separator')

// Initialize sortable for nested children dropzone
watch(
  childrenDropzoneRef,
  (el) => {
    if (el && isLayoutField.value) {
      useSortable(el, children.value, {
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
        // Pointer-based drag — cards embed real inputs (live component preview)
        // that break native HTML5 DnD. Consistent across the 'form-fields' group.
        forceFallback: true,
        fallbackOnBody: true,
        swapThreshold: 0.65,
        onAdd(evt) {
          const fieldType = evt.item.dataset.fieldType
          if (fieldType) {
            evt.item.remove()
            emit('addField', {
              fieldType,
              parentPath: props.path,
              index: evt.newIndex,
            })
          } else {
            // Moving from another list
            const fromPath = evt.item.dataset.path
            if (fromPath) {
              emit('moveField', {
                fromPath,
                toPath: props.path,
                toIndex: evt.newIndex,
              })
            }
          }
        },
      })
    }
  },
  { immediate: true },
)

function onSelect() {
  emit('select', props.path)
}

function onRemove() {
  emit('remove', props.path)
}

function onDuplicate() {
  emit('duplicate', props.path)
}

// Entering an inline editor also selects the field, so the properties panel
// (size, alignment, width, …) opens alongside the in-place edit.
function beginEdit(which) {
  emit('select', props.path)
  if (which === 'label') editingLabel.value = true
  else if (which === 'instructions') editingInstructions.value = true
  else if (which === 'heading') editingHeading.value = true
  else if (which === 'subheading') editingSubheading.value = true
}
</script>

<template>
  <BaseClickableRow
    class="tw:relative tw:group tw:p-2 tw:border-2 tw:border-transparent tw:transition-colors"
    :class="{
      'tw:border-primary tw:bg-primary/5': isSelected,
      'tw:hover:border-primary/40': !isSelected,
      'tw:opacity-60': field.hidden,
    }"
    :style="cardWidthStyle"
    :data-path="path"
    :aria-label="`Select field ${field.label || field.name || field.type}`"
    @click.stop="onSelect"
  >
    <!-- Floating controls — drag grip + duplicate + delete, plus the Hidden /
         width badges. No per-field chrome wrapper: the field renders WYSIWYG and
         these appear only on hover or when the field is selected. The grip is
         the drag handle (SortableJS `handle: '.drag-handle'`). -->
    <div
      class="tw:absolute tw:top-2 tw:right-2 tw:flex tw:items-center tw:gap-1 tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:z-raised"
      :class="{ 'tw:opacity-100': isSelected }"
    >
      <span
        v-if="field.hidden"
        class="tw:text-xs tw:font-semibold tw:text-amber-700 tw:bg-amber-50 tw:rounded tw:px-1.5 tw:py-0.5"
        title="Hidden on the live form"
      >
        Hidden
      </span>
      <span
        v-if="widthLabel"
        class="tw:text-xs tw:font-semibold tw:text-secondary tw:bg-main-hover tw:rounded tw:px-1.5 tw:py-0.5"
        title="Field width on the form"
      >
        {{ widthLabel }}
      </span>
      <span v-if="fieldDescription" @click.stop @mousedown.stop>
        <BaseTooltip :content="fieldDescription" placement="top">
          <span
            class="tw:p-1.5 tw:rounded-lg tw:bg-main tw:border tw:border-divider tw:shadow-sm tw:text-secondary tw:hover:bg-main-hover tw:cursor-help tw:inline-flex tw:transition-colors"
          >
            <IconInfoCircle :size="14" />
          </span>
        </BaseTooltip>
      </span>
      <button
        class="drag-handle tw:p-1.5 tw:rounded-lg tw:bg-main tw:border tw:border-divider tw:shadow-sm tw:text-secondary tw:hover:bg-main-hover tw:cursor-grab tw:active:cursor-grabbing tw:transition-colors"
        title="Drag to reorder"
        @click.stop
      >
        <IconGripVertical :size="14" />
      </button>
      <button
        class="tw:p-1.5 tw:rounded-lg tw:bg-main tw:border tw:border-divider tw:shadow-sm tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
        title="Duplicate Field"
        @click.stop="onDuplicate"
      >
        <IconCopy :size="14" />
      </button>
      <button
        class="tw:p-1.5 tw:rounded-lg tw:bg-main tw:border tw:border-divider tw:shadow-sm tw:text-red-500 tw:hover:bg-red-50 tw:transition-colors"
        title="Remove Field"
        @click.stop="onRemove"
      >
        <IconTrash :size="14" />
      </button>
    </div>

    <!-- Layout containers keep a slim, editable title (it renders on the live
         form for sections) — no big icon box or type chrome. Leaf fields have
         no header at all; they render WYSIWYG below. Input Tables render their
         own label via the preview, so they skip this header. -->
    <div v-if="isLayoutField && !isInputTable" class="tw:flex tw:items-center tw:gap-2 tw:pr-24">
      <BaseTextInput
        v-if="editingLabel"
        v-model="field.label"
        size="sm"
        placeholder="Section title"
        @click.stop
        @mousedown.stop
        @keyup.enter="editingLabel = false"
        @keyup.esc="editingLabel = false"
        @blur="editingLabel = false"
      />
      <template v-else>
        <span
          class="tw:text-sm tw:font-bold tw:text-on-main tw:truncate tw:cursor-text tw:hover:text-primary"
          title="Click to rename"
          @click.stop="beginEdit('label')"
          @mousedown.stop
        >
          {{ field.label || layoutTypeLabel }}
        </span>
        <span class="tw:text-micro tw:uppercase tw:tracking-wide tw:text-secondary/60">
          {{ layoutTypeLabel }}
        </span>
      </template>
    </div>

    <!-- Instructions — click the callout to edit its content in place with the
         same rich-text editor as the properties panel. @click/@mousedown.stop so
         editing doesn't start a drag or toggle card selection. -->
    <template v-if="field.type === 'instructions'">
      <div
        v-if="editingInstructions"
        class="tw:mt-2 tw:rounded-lg tw:border tw:border-blue-300 tw:overflow-hidden"
        @click.stop
        @mousedown.stop
      >
        <BaseRichTextEditor v-model="field.html" />
        <div class="tw:flex tw:justify-end tw:bg-blue-50 tw:px-2 tw:py-1.5">
          <button
            type="button"
            class="tw:text-xs tw:font-medium tw:text-primary tw:hover:bg-primary/10 tw:rounded tw:px-2 tw:py-1 tw:bg-transparent tw:border-0 tw:cursor-pointer"
            @click.stop="editingInstructions = false"
          >
            Done
          </button>
        </div>
      </div>
      <div
        v-else
        class="tw:mt-2 tw:rounded-lg tw:border tw:border-blue-200 tw:bg-blue-50 tw:px-4 tw:py-3 tw:text-sm tw:prose tw:prose-sm tw:max-w-none tw:cursor-text tw:hover:border-blue-300"
        title="Click to edit"
        @click.stop="beginEdit('instructions')"
        @mousedown.stop
        v-html="field.html || '<em class=\'tw:text-secondary\'>Empty instructions — click to add content.</em>'"
      />
    </template>
    <!-- Header — heading + subheading edit in place, matching the live render's
         size + alignment. Click either line to edit; Enter/blur commits. -->
    <div v-else-if="field.type === 'header'" class="tw:mt-2" :class="headerAlignClass">
      <BaseTextInput
        v-if="editingHeading"
        v-model="field.text"
        size="sm"
        placeholder="Heading text"
        @click.stop
        @mousedown.stop
        @keyup.enter="editingHeading = false"
        @keyup.esc="editingHeading = false"
        @blur="editingHeading = false"
      />
      <div
        v-else
        class="tw:font-bold tw:text-on-main tw:cursor-text tw:hover:text-primary"
        :class="headerSizeClass"
        title="Click to edit heading"
        @click.stop="beginEdit('heading')"
        @mousedown.stop
      >
        {{ field.text || 'Heading' }}
      </div>

      <BaseTextInput
        v-if="editingSubheading"
        v-model="field.subtext"
        size="sm"
        placeholder="Subheading text"
        class="tw:mt-1"
        @click.stop
        @mousedown.stop
        @keyup.enter="editingSubheading = false"
        @keyup.esc="editingSubheading = false"
        @blur="editingSubheading = false"
      />
      <div
        v-else
        class="tw:text-sm tw:mt-1 tw:cursor-text tw:hover:text-primary"
        :class="field.subtext ? 'tw:text-secondary' : 'tw:text-placeholder tw:italic'"
        title="Click to edit subheading"
        @click.stop="beginEdit('subheading')"
        @mousedown.stop
      >
        {{ field.subtext || 'Add smaller text below the heading' }}
      </div>
    </div>
    <!-- Checklist gets an interactive builder matrix (add/remove rows & columns
         inline) instead of the read-only preview, so authors edit the grid
         directly on the canvas. -->
    <ChecklistBuilderCard v-else-if="field.type === 'checklist'" :field="field" />
    <!-- Input Table — column-based builder (renders like the preview, add/remove
         columns via dialog, no add-row; respondents add rows at fill time). -->
    <InputTableBuilderCard v-else-if="isInputTable" :field="field" />
    <!-- Leaf field — a click-to-edit label above the real component preview.
         The label edits in place like the header/checklist/section labels;
         the preview renders label-less (previewFields blanks it) so there's no
         duplicate. pointer-events-none on the preview keeps clicks/drag flowing
         to the card for select + reorder. -->
    <div v-else-if="!isLayoutField" class="tw:mt-2">
      <div v-if="showEditableLabel" class="tw:mb-1">
        <BaseTextInput
          v-if="editingLabel"
          v-model="field.label"
          size="sm"
          placeholder="Field label"
          @click.stop
          @mousedown.stop
          @keyup.enter="editingLabel = false"
          @keyup.esc="editingLabel = false"
          @blur="editingLabel = false"
        />
        <div
          v-else
          class="tw:inline-flex tw:items-center tw:gap-0.5 tw:text-sm tw:font-medium tw:text-secondary tw:cursor-text tw:hover:text-primary"
          title="Click to rename"
          @click.stop="beginEdit('label')"
          @mousedown.stop
        >
          {{ field.label || '(no label)' }}
          <span v-if="field.required" class="tw:text-bad">*</span>
        </div>
      </div>
      <div class="tw:pointer-events-none">
        <DynamicForm :fields="previewFields" :modelValue="{}" />
      </div>
    </div>

    <!-- Children for layout fields (Input Tables manage columns via their own
         card, so they don't expose the nested drop zone). -->
    <div v-if="isLayoutField && hasChildren && !isInputTable" class="tw:mt-3">
      <div
        ref="childrenDropzoneRef"
        class="tw:min-h-20 tw:p-3 tw:bg-main/50 tw:border-2 tw:border-dashed tw:border-divider tw:rounded-xl tw:flex tw:flex-wrap tw:content-start tw:gap-2 tw:transition-all"
        :class="{ 'tw:border-primary tw:bg-primary/5': isDragging }"
      >
        <FormCanvasField
          v-for="(child, index) in children"
          :key="child.name || index"
          :field="child"
          :path="`${path}.${childrenKey}.${index}`"
          :isSelected="selectedPath === `${path}.${childrenKey}.${index}`"
          :selectedPath="selectedPath"
          :isDragging="isDragging"
          @select="$emit('select', $event)"
          @remove="$emit('remove', $event)"
          @duplicate="$emit('duplicate', $event)"
          @moveField="$emit('moveField', $event)"
          @addField="$emit('addField', $event)"
        />

        <div
          v-if="children.length === 0"
          class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:py-4"
        >
          <IconCirclePlus :size="24" class="tw:text-secondary/20 tw:mb-1" />
          <BaseText as="div" variant="overline" color="inherit" class="tw:text-secondary/40">
            Drop nested fields here
          </BaseText>
        </div>
      </div>
    </div>
  </BaseClickableRow>
</template>

<style lang="scss" scoped>
// SortableJS integration
:deep(.sortable-ghost) {
  opacity: 0.7;
  background: var(--tw-primary);
  border: 2px dashed var(--tw-primary);
}

:deep(.sortable-chosen) {
  background: var(--tw-secondary-hover);
}

:deep(.sortable-drag) {
  background: white;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  border-radius: 12px;
}
</style>
