<script setup>
import { IconCopy, IconTrash, IconGripVertical, IconCirclePlus } from '@tabler/icons-vue'
import { useSortable } from '@vueuse/integrations/useSortable'
import { FIELD_TYPES, FIELD_WIDTHS } from '@/constants/formBuilderConfig'
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

const LAYOUT_TYPES = new Set(['section', 'row', 'column', 'repeater'])

const fieldIcon = computed(() => FIELD_TYPES[props.field.type]?.icon || null)

const isLayoutField = computed(() => LAYOUT_TYPES.has(props.field.type))

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
const previewFields = computed(() => [{ ...props.field, width: 'full', hidden: false }])

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
</script>

<template>
  <BaseClickableRow
    class="tw:bg-main tw:border-2 tw:border-divider tw:rounded-xl tw:p-3 tw:transition-all tw:duration-200 tw:relative tw:group"
    :class="{
      'tw:border-primary tw:ring-4 tw:ring-primary/10 tw:bg-main-selected': isSelected,
      'tw:bg-main-hover/30': isLayoutField,
      'tw:hover:border-primary/50 tw:hover:shadow-lg': !isSelected,
      'tw:opacity-60': field.hidden,
    }"
    :style="cardWidthStyle"
    :data-path="path"
    :aria-label="`Select field ${field.label || field.name || field.type}`"
    @click.stop="onSelect"
  >
    <!-- Field Controls (Top Right) -->
    <div
      class="tw:absolute tw:top-2 tw:right-2 tw:flex tw:items-center tw:gap-1 tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:z-raised"
      :class="{ 'tw:opacity-100': isSelected }"
    >
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

    <!-- Field Header -->
    <div
      class="tw:flex tw:items-center tw:gap-2 drag-handle tw:cursor-grab tw:active:cursor-grabbing"
    >
      <div
        class="tw:w-10 tw:h-10 tw:bg-main-hover tw:rounded-lg tw:flex tw:items-center tw:justify-center tw:shrink-0"
      >
        <component :is="fieldIcon" v-if="fieldIcon" :size="20" class="tw:text-primary" />
      </div>
      <div class="tw:flex tw:flex-col tw:overflow-hidden">
        <div class="tw:text-sm tw:font-bold tw:text-on-main tw:truncate">
          {{ field.label || field.name || field.type }}
        </div>
        <BaseText as="div" variant="overline" color="inherit" class="tw:text-secondary/60">
          {{ field.type }}
        </BaseText>
      </div>
      <div class="tw:flex-1" />
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
      <IconGripVertical
        :size="20"
        class="tw:text-divider tw:cursor-grab tw:active:cursor-grabbing"
      />
    </div>

    <!-- Preview — generic disabled input for input-style fields,
         live HTML render for the Instructions block so authors see
         the exact callout the floor user will see. -->
    <div
      v-if="field.type === 'instructions'"
      class="tw:pointer-events-none tw:mt-2 tw:rounded-lg tw:border tw:border-blue-200 tw:bg-blue-50 tw:px-4 tw:py-3 tw:text-sm tw:prose tw:prose-sm tw:max-w-none"
      v-html="field.html || '<em class=\'tw:text-secondary\'>Empty instructions — add content in the properties panel.</em>'"
    />
    <!-- Live render of the field's actual component (read-only), so the card
         shows exactly what the floor user will see. pointer-events-none keeps
         clicks/drag flowing to the card for select + reorder. -->
    <div v-else-if="!isLayoutField" class="tw:pointer-events-none tw:mt-2">
      <DynamicForm :fields="previewFields" :modelValue="{}" readonly />
    </div>

    <!-- Children for layout fields -->
    <div v-if="isLayoutField && hasChildren" class="tw:mt-3">
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
