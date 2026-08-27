<script setup>
import {
  IconCopy,
  IconTrash,
  IconGripHorizontal,
  IconCirclePlus,
  IconInfoCircle,
  IconPlus,
  IconSettings,
} from '@tabler/icons-vue'
import { useSortable } from '@vueuse/integrations/useSortable'
import {
  FIELD_WIDTHS,
  FIELD_TYPES,
  FIELD_KIND_OPTIONS,
  fieldKindId,
} from '@/constants/formBuilderConfig'
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
  // SortableJS group name, threaded down from FormCanvas. Containers must
  // share their canvas's group so a field can move between the canvas and a
  // row/column inside it — and must NOT share it with a DIFFERENT canvas on
  // the same page, or a field could be dragged from one form into another
  // (possible since the workflow builder expands every step at once).
  group: {
    type: String,
    default: 'form-fields',
  },
})

// `select` = highlight this field. `configure` = open its properties — a
// SEPARATE intent (user request 2026-08-15): clicking a card or its label to
// rename shouldn't throw the properties panel in the way.
const emit = defineEmits([
  'select',
  'configure',
  'changeKind',
  'remove',
  'duplicate',
  'moveField',
  'addField',
  'insertField',
])

const childrenDropzoneRef = ref(null)

// Click-to-edit for a layout container's title (section/row/column), which is
// the only place a container's label surfaces now that leaf fields render
// WYSIWYG with no chrome header.
const editingLabel = ref(false)
// Click-to-edit for an Instructions block's rich-text content, in place.
const editingInstructions = ref(false)
// Click-to-edit for a leaf field's description (stored as field.hint).
const editingHint = ref(false)
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

// Where THIS card sits, split for insert-before: everything up to the last
// path segment is the parent, the last segment is our index. Root cards have
// no parent ("2" → parentPath null, index 2).
const ownParentPath = computed(() => {
  const i = props.path.lastIndexOf('.')
  return i === -1 ? null : props.path.slice(0, i)
})
const ownIndex = computed(() => {
  const i = props.path.lastIndexOf('.')
  return Number(props.path.slice(i + 1))
})

function requestInsertBefore() {
  emit('insertField', { parentPath: ownParentPath.value, index: ownIndex.value })
}

function requestInsertIntoChildren() {
  emit('insertField', { parentPath: props.path, index: children.value.length })
}

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
const previewFields = computed(() => [{ ...props.field, width: 'full', hidden: false, label: '' }])

// The shared question header (label + type picker + description). Rendered
// for every card that represents a QUESTION — including Multiple Choice /
// Checkboxes, which draw their own options card and so used to miss the type
// picker entirely (bug 2026-08-15). Excluded: layout containers, the
// display-only blocks, and the widgets that own a full custom card with its
// own title (Checklist, Input Table).
const HEADER_EXCLUDED_TYPES = new Set(['header', 'instructions', 'separator', 'checklist'])
const showFieldHeader = computed(
  () => !isLayoutField.value && !isInputTable.value && !HEADER_EXCLUDED_TYPES.has(props.field.type),
)

// Required applies to things a respondent answers — not to layout containers
// or display-only blocks (heading, instructions, separator).
const NON_INPUT_TYPES = new Set(['separator', 'header', 'instructions'])
const supportsRequired = computed(
  () => !isLayoutField.value && !NON_INPUT_TYPES.has(props.field.type),
)

// Field-type picker beside the label. `kindId` is null for types that don't
// convert cleanly (checklist, input table, RCA, …) — those simply don't show
// the picker rather than offering a lossy switch.
const kindId = computed(() => fieldKindId(props.field))
// Canvas shows COMPACT labels — "Lookup (Item, Supplier, Site…)" overflowed
// the w-40 in-place type select over the neighbouring card (reported
// 2026-08-26). The palette keeps the descriptive label.
const kindOptions = FIELD_KIND_OPTIONS.map((k) => ({
  id: k.id,
  name: k.label.replace(/\s*\(.*\)\s*$/, ''),
}))

// Initialize sortable for nested children dropzone
watch(
  childrenDropzoneRef,
  (el) => {
    if (el && isLayoutField.value) {
      useSortable(el, children.value, {
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

// Entering an inline editor highlights the field but does NOT open its
// properties — renaming in place is the common case and the panel used to
// land on top of it (user report 2026-08-15). The gear opens properties.
function beginEdit(which) {
  emit('select', props.path)
  if (which === 'label') editingLabel.value = true
  else if (which === 'hint') editingHint.value = true
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
    <!-- Drag grip — top-CENTRE, like Google Forms (user request 2026-08-15).
         It was in the top-right cluster with the actions; giving it its own
         spot means the row of icons at the bottom is all "do something to this
         field" and the grip is unmistakably "move this field". SortableJS
         binds to `.drag-handle`. -->
    <button
      class="drag-handle tw:absolute tw:top-0.5 tw:left-1/2 tw:-translate-x-1/2 tw:px-2 tw:rounded tw:text-secondary tw:hover:text-on-main tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:cursor-grab tw:active:cursor-grabbing tw:z-raised"
      :class="{ 'tw:opacity-100': isSelected }"
      title="Drag to reorder"
      @click.stop
    >
      <IconGripHorizontal :size="16" />
    </button>

    <!-- Insert BEFORE this field — the click alternative to dropping a drag
         exactly in the gap (user report 2026-08-26: the drop zone is easy to
         miss). Hover-revealed at the top-left corner; works between sections
         too, since a section is just another card in this list. -->
    <BaseTooltip content="Insert a field above">
      <button
        type="button"
        class="tw:absolute tw:-top-2.5 tw:left-2 tw:flex tw:size-5 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-divider tw:bg-card tw:text-secondary tw:opacity-0 tw:shadow-sm tw:transition-opacity tw:hover:border-primary tw:hover:text-primary tw:group-hover:opacity-100 tw:z-raised"
        :aria-label="`Insert a field above ${field.label || field.name || field.type}`"
        @click.stop="requestInsertBefore"
      >
        <IconPlus :size="13" />
      </button>
    </BaseTooltip>

    <!-- Layout containers keep a slim, editable title (it renders on the live
         form for sections) — no big icon box or type chrome. Leaf fields have
         no header at all; they render WYSIWYG below. Input Tables render their
         own label via the preview, so they skip this header. -->
    <div v-if="isLayoutField && !isInputTable" class="tw:flex tw:items-center tw:gap-2">
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

    <!-- Label + type picker on one row, description beneath, preview below
         — the Google Forms question layout (user request 2026-08-15). -->
    <div v-if="showFieldHeader" class="tw:mb-1">
      <div class="tw:flex tw:items-start tw:gap-2">
        <div class="tw:flex-1 tw:min-w-0">
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
            {{ field.label || 'Untitled field' }}
            <span v-if="field.required" class="tw:text-bad">*</span>
          </div>
        </div>

        <!-- Change the field's type in place. Only offered for kinds that
             convert cleanly (see FIELD_KIND_OPTIONS) — a Checklist or Input
             Table has structure nothing else can hold. -->
        <div v-if="kindId" class="tw:w-40 tw:shrink-0 tw:overflow-hidden" @click.stop @mousedown.stop>
          <BaseSelect
            :modelValue="kindId"
            :options="kindOptions"
            optionLabel="name"
            optionValue="id"
            :required="true"
            size="sm"
            @update:modelValue="(id) => emit('changeKind', { path, kindId: id })"
          />
        </div>
      </div>

      <!-- Description (field.hint) — shown once set, or while the field is
           selected so it can be added without opening properties. -->
      <div v-if="field.hint || isSelected" class="tw:mt-0.5">
        <BaseTextInput
          v-if="editingHint"
          v-model="field.hint"
          size="sm"
          placeholder="Description (optional)"
          @click.stop
          @mousedown.stop
          @keyup.enter="editingHint = false"
          @keyup.esc="editingHint = false"
          @blur="editingHint = false"
        />
        <div
          v-else
          class="tw:text-xs tw:cursor-text tw:hover:text-primary"
          :class="field.hint ? 'tw:text-secondary' : 'tw:text-placeholder tw:italic'"
          title="Click to edit the description"
          @click.stop="beginEdit('hint')"
          @mousedown.stop
        >
          {{ field.hint || 'Add description' }}
        </div>
      </div>
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
        v-html="
          field.html ||
          '<em class=\'tw:text-secondary\'>Empty instructions — click to add content.</em>'
        "
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
    <!-- Choice fields with CUSTOM options — Multiple Choice, Checkboxes AND
         Dropdown (2026-08-15) share one inline options builder: they're
         authored identically, so "Add option" shouldn't be exclusive to two
         of the three. Option-Set-bound fields keep the read-only preview —
         the set is tenant config shared across every form that uses it. -->
    <OptionGroupBuilderCard
      v-else-if="['optionGroup', 'select'].includes(field.type) && !field.optionSetId"
      :field="field"
    />
    <!-- Leaf field — a click-to-edit label above the real component preview.
         The label edits in place like the header/checklist/section labels;
         the preview renders label-less (previewFields blanks it) so there's no
         duplicate. pointer-events-none on the preview keeps clicks/drag flowing
         to the card for select + reorder. -->
    <div v-else-if="!isLayoutField" class="tw:mt-2">
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
          :group="group"
          @select="$emit('select', $event)"
          @configure="$emit('configure', $event)"
          @changeKind="$emit('changeKind', $event)"
          @remove="$emit('remove', $event)"
          @duplicate="$emit('duplicate', $event)"
          @moveField="$emit('moveField', $event)"
          @addField="$emit('addField', $event)"
          @insertField="$emit('insertField', $event)"
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

      <!-- Click-to-add INTO this container — deliberately OUTSIDE the
           dropzone div: SortableJS has no draggable filter here, so an
           element inside the container would join its index math. -->
      <button
        type="button"
        class="tw:mt-1.5 tw:flex tw:w-full tw:items-center tw:justify-center tw:gap-1.5 tw:rounded-lg tw:border tw:border-dashed tw:border-divider tw:py-1.5 tw:text-xs tw:font-medium tw:text-secondary tw:transition-colors tw:hover:border-primary tw:hover:text-primary"
        @click.stop="requestInsertIntoChildren"
      >
        <IconPlus :size="14" />
        Add field
      </button>
    </div>
    <!-- Footer — every action for this field in one row, Google Forms style
         (user request 2026-08-15): purpose tooltip + status badges on the
         left, duplicate / delete / Required / properties on the right. The
         top of the card is left to the label and its type picker. -->
    <div
      class="tw:mt-2 tw:pt-2 tw:border-t tw:border-divider tw:flex tw:items-center tw:gap-1 tw:flex-wrap"
      @click.stop
      @mousedown.stop
    >
      <BaseTooltip v-if="fieldDescription" :content="fieldDescription" placement="top">
        <span
          class="tw:p-1 tw:rounded tw:text-secondary tw:hover:text-on-main tw:cursor-help tw:inline-flex"
        >
          <IconInfoCircle :size="15" />
        </span>
      </BaseTooltip>
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

      <div class="tw:ml-auto tw:flex tw:items-center tw:gap-1">
        <button
          class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main tw:transition-colors"
          title="Duplicate field"
          @click.stop="onDuplicate"
        >
          <IconCopy :size="16" />
        </button>
        <button
          class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-red-50 tw:hover:text-red-500 tw:transition-colors"
          title="Delete field"
          @click.stop="onRemove"
        >
          <IconTrash :size="16" />
        </button>

        <template v-if="supportsRequired">
          <div class="tw:w-px tw:h-5 tw:bg-divider tw:mx-1"></div>
          <span class="tw:text-xs tw:font-medium tw:text-secondary">Required</span>
          <BaseSwitch v-model="field.required" size="sm" />
        </template>

        <div class="tw:w-px tw:h-5 tw:bg-divider tw:mx-1"></div>
        <button
          class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:bg-main-hover tw:hover:text-on-main tw:transition-colors"
          title="Field properties"
          @click.stop="emit('configure', path)"
        >
          <IconSettings :size="16" />
        </button>
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
