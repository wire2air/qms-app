<script setup>
import { IconCopy, IconTrash, IconGripVertical, IconCirclePlus } from '@tabler/icons-vue'
import { useSortable } from '@vueuse/integrations/useSortable'
import { FIELD_TYPES } from '@/constants/formBuilderConfig'

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
  <div
    class="tw:bg-main tw:border-2 tw:border-divider tw:rounded-xl tw:p-3 tw:cursor-pointer tw:transition-all tw:duration-200 tw:relative tw:group"
    :class="{
      'tw:border-primary tw:ring-4 tw:ring-primary/10 tw:bg-main-selected': isSelected,
      'tw:bg-main-hover/30': isLayoutField,
      'tw:hover:border-primary/50 tw:hover:shadow-lg': !isSelected,
    }"
    :data-path="path"
    @click.stop="onSelect"
  >
    <!-- Field Controls (Top Right) -->
    <div
      class="tw:absolute tw:top-2 tw:right-2 tw:flex tw:items-center tw:gap-1 tw:opacity-0 tw:group-hover:opacity-100 tw:transition-opacity tw:z-10"
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
        <div class="ds-label-sm tw:text-secondary/60">
          {{ field.type }}
        </div>
      </div>
      <div class="tw:flex-1" />
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
      v-html="
        field.html ||
        '<em class=\'tw:text-secondary\'>Empty instructions — add content in the properties panel.</em>'
      "
    />
    <div v-else-if="!isLayoutField" class="tw:pointer-events-none tw:opacity-60 tw:mt-2">
      <BaseTextInput
        :label="field.label || field.name"
        :placeholder="field.placeholder"
        disabled
        size="sm"
      />
    </div>

    <!-- Children for layout fields -->
    <div v-if="isLayoutField && hasChildren" class="tw:mt-3">
      <div
        ref="childrenDropzoneRef"
        class="tw:min-h-20 tw:p-3 tw:bg-main/50 tw:border-2 tw:border-dashed tw:border-divider tw:rounded-xl tw:flex tw:flex-col tw:gap-2 tw:transition-all"
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
          <div class="ds-label-sm tw:text-secondary/40">Drop nested fields here</div>
        </div>
      </div>
    </div>
  </div>
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
