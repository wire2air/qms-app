<script setup>
import {
  IconMenu2,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconEdit,
  IconEye,
  IconCode,
  IconTrash,
  IconDeviceFloppy,
  IconX,
  IconCopy,
} from '@tabler/icons-vue'
import { useFormBuilder } from '@/composables/useFormBuilder'
import FormFieldPalette from './FormFieldPalette.vue'
import FormCanvas from './FormCanvas.vue'
import FormFieldConfig from './FormFieldConfig.vue'
import DynamicForm from '@/components/form/DynamicForm.js'

const props = defineProps({
  title: {
    type: String,
    default: 'Form Builder',
  },
  initialSchema: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['save', 'update:schema'])

const toast = useToast()

const {
  schema,
  selectedField,
  selectedFieldPath,
  isDragging,
  addField,
  removeField,
  moveField,
  selectField,
  clearSelection,
  duplicateField,
  undo,
  redo,
  canUndo,
  canRedo,
  exportSchema,
  clearSchema,
} = useFormBuilder(props.initialSchema)

const leftDrawerOpen = ref(false)
const rightDrawerOpen = ref(false)
const showPreview = ref(false)
const showJsonDialog = ref(false)
const { confirm } = useConfirm()
const previewData = ref({})

const jsonContent = computed({
  get: () => JSON.stringify(schema.value, null, 2),
  set: () => {},
})

// Watch schema changes and emit
watch(
  schema,
  (newSchema) => {
    emit('update:schema', newSchema)
  },
  { deep: true },
)

// Watch selectedField to open right drawer
watch(selectedField, (field) => {
  if (field) {
    rightDrawerOpen.value = true
  }
})

function onDragStart() {
  isDragging.value = true
}

function onDragEnd() {
  isDragging.value = false
}

function onAddFieldFromClick(fieldType) {
  addField(fieldType)
}

function handleSelectField(path) {
  selectField(path)
  rightDrawerOpen.value = true
}

function closeRightDrawer() {
  rightDrawerOpen.value = false
  clearSelection()
}

function togglePreview() {
  showPreview.value = !showPreview.value
}

function onSave() {
  const schemaData = exportSchema()
  if (validateSchema(schemaData)) {
    emit('save', schemaData)
  }
}

function validateSchema(fields) {
  for (const field of fields) {
    // Check if field has a name
    if (!field.name || field.name.trim() === '') {
      toast.error(`Field "${field.label || field.type}" is missing a name`, {
        caption: 'All fields must have a unique name',
      })
      return false
    }

    // Check Options (Select, Radio, OptionGroup)
    if (field.options && Array.isArray(field.options)) {
      for (const [index, option] of field.options.entries()) {
        const val = typeof option === 'object' ? option?.value : option
        if (!val || String(val).trim() === '') {
          toast.error(
            `Option ${index + 1} in field "${field.label || field.name}" is missing a value`,
          )
          return false
        }
      }
    }

    // Check Checklist Rows
    if (field.rows && Array.isArray(field.rows)) {
      for (const [index, row] of field.rows.entries()) {
        const val = typeof row === 'object' ? row?.value : row
        if (!val || String(val).trim() === '') {
          toast.error(`Row ${index + 1} in field "${field.label || field.name}" is missing a value`)
          return false
        }
      }
    }

    // Check Checklist Columns
    if (field.columns && Array.isArray(field.columns)) {
      for (const [colIndex, col] of field.columns.entries()) {
        if (!col.value || String(col.value).trim() === '') {
          toast.error(
            `Column ${colIndex + 1} in field "${field.label || field.name}" is missing a value`,
          )
          return false
        }

        // Check Column Options (for dropdown type columns)
        if (col.options && Array.isArray(col.options)) {
          for (const [optIndex, option] of col.options.entries()) {
            const val = typeof option === 'object' ? option?.value : option
            if (!val || String(val).trim() === '') {
              toast.error(
                `Option ${optIndex + 1} in Column "${col.label || col.value}" (Field: "${field.label || field.name}") is missing a value`,
              )
              return false
            }
          }
        }
      }
    }

    // Check children recursively
    if (field.children && field.children.length > 0) {
      if (!validateSchema(field.children)) return false
    }

    // Check template (repeater) recursively
    if (field.template && field.template.length > 0) {
      if (!validateSchema(field.template)) return false
    }
  }
  return true
}

function onPreviewSubmit(data) {
  // Preview only — no record is created. The toast used to say "Form
  // submitted!" which read like a real save; clarified so authors don't
  // think they accidentally posted something. Payload still logs to
  // console for debugging the schema.
  toast.notify({
    type: 'info',
    message: 'Preview only — no record was saved.',
    caption: 'Check console for the form payload',
  })
  console.info('Form preview payload:', data)
}

async function confirmClear() {
  if (!(schema.value?.length > 0)) return
  const ok = await confirm({
    title: 'Clear Form?',
    message:
      'Are you sure you want to clear all fields? This action will remove all current content and cannot be undone.',
    okLabel: 'Delete All',
    danger: true,
  })
  if (ok) clearSchema()
}

function copyJson() {
  navigator.clipboard.writeText(jsonContent.value)
  toast.success('JSON copied to clipboard')
}
</script>

<template>
  <div class="tw:flex tw:h-full tw:bg-main tw:overflow-hidden">
    <!-- Left Sidebar - Field Palette -->
    <Transition name="slide-left">
      <aside
        v-if="leftDrawerOpen"
        class="tw:w-80 tw:border-r tw:border-divider tw:bg-sidebar tw:flex tw:flex-col tw:shrink-0"
      >
        <FormFieldPalette
          :isDragging="isDragging"
          @dragStart="onDragStart"
          @dragEnd="onDragEnd"
          @fieldClick="onAddFieldFromClick"
        />
      </aside>
    </Transition>

    <!-- Main Content Area -->
    <div class="tw:flex tw:flex-1 tw:flex-col tw:overflow-hidden">
      <!-- Header -->
      <header
        class="tw:sticky tw:top-0 tw:z-dropdown tw:px-4 tw:py-2 tw:bg-sidebar tw:border-b tw:border-divider"
      >
        <div class="tw:flex tw:items-center tw:justify-between">
          <div class="tw:flex tw:items-center tw:gap-3">
            <button
              class="tw:p-2 tw:rounded-lg tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
              title="Toggle Fields Panel"
              @click="leftDrawerOpen = !leftDrawerOpen"
            >
              <IconMenu2 :size="20" />
            </button>

            <div class="tw:text-lg tw:font-bold tw:text-on-sidebar">
              <slot name="title">
                {{ title || 'Form Builder' }}
              </slot>
            </div>
          </div>

          <div class="tw:flex tw:items-center tw:gap-3">
            <div class="tw:flex tw:items-center tw:gap-1">
              <button
                class="tw:p-2 tw:rounded-lg tw:transition-colors"
                :class="
                  canUndo
                    ? 'tw:text-secondary tw:hover:bg-main-hover'
                    : 'tw:text-secondary/30 tw:cursor-not-allowed'
                "
                :disabled="!canUndo"
                title="Undo"
                @click="undo"
              >
                <IconArrowBackUp :size="20" />
              </button>
              <button
                class="tw:p-2 tw:rounded-lg tw:transition-colors"
                :class="
                  canRedo
                    ? 'tw:text-secondary tw:hover:bg-main-hover'
                    : 'tw:text-secondary/30 tw:cursor-not-allowed'
                "
                :disabled="!canRedo"
                title="Redo"
                @click="redo"
              >
                <IconArrowForwardUp :size="20" />
              </button>
            </div>

            <div class="tw:w-px tw:h-6 tw:bg-divider tw:mx-1" />

            <div class="tw:flex tw:items-center tw:gap-1">
              <button
                class="tw:p-2 tw:rounded-lg tw:transition-colors"
                :class="
                  showPreview
                    ? 'tw:text-primary tw:bg-primary/10'
                    : 'tw:text-secondary tw:hover:bg-main-hover'
                "
                :title="showPreview ? 'Edit Mode' : 'Preview'"
                @click="togglePreview"
              >
                <component :is="showPreview ? IconEdit : IconEye" :size="20" />
              </button>

              <button
                class="tw:p-2 tw:rounded-lg tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
                title="View JSON"
                @click="showJsonDialog = true"
              >
                <IconCode :size="20" />
              </button>

              <button
                class="tw:p-2 tw:rounded-lg tw:text-red-500 tw:hover:bg-red-50 tw:transition-colors"
                title="Clear All"
                @click="confirmClear"
              >
                <IconTrash :size="20" />
              </button>
            </div>

            <div class="tw:w-px tw:h-6 tw:bg-divider tw:mx-2" />

            <BaseButton variant="primary" @click="onSave">
              <IconDeviceFloppy :size="18" />
              Save
            </BaseButton>
          </div>
        </div>
      </header>

      <!-- Content + Right Sidebar -->
      <div class="tw:flex tw:flex-1 tw:overflow-hidden">
        <!-- Canvas Area -->
        <div class="tw:flex tw:flex-1 tw:overflow-hidden tw:bg-main">
          <!-- Edit Mode - Canvas (always visible) -->
          <div class="tw:flex-1 tw:overflow-auto tw:p-4">
            <div class="tw:max-w-4xl tw:mx-auto tw:min-h-full">
              <FormCanvas
                v-model="previewData"
                :fields="schema"
                :selectedPath="selectedFieldPath"
                :isDragging="isDragging"
                @addField="addField"
                @selectField="handleSelectField"
                @removeField="removeField"
                @duplicateField="duplicateField"
                @moveField="moveField"
              />
            </div>
          </div>

          <!-- Preview Panel (side-by-side when toggled) -->
          <Transition name="slide-right">
            <div
              v-if="showPreview"
              class="tw:flex-1 tw:overflow-auto tw:border-l tw:border-divider tw:bg-main tw:py-6 tw:px-4"
            >
              <div
                class="tw:max-w-4xl tw:mx-auto tw:bg-sidebar tw:border tw:border-divider tw:rounded-2xl tw:shadow-xl tw:overflow-hidden"
              >
                <div class="tw:bg-main tw:px-5 tw:py-3 tw:border-b tw:border-divider">
                  <div class="tw:text-xl tw:font-bold tw:text-on-sidebar">Form Preview</div>
                </div>
                <div class="tw:p-5">
                  <DynamicForm v-model="previewData" :fields="schema" @submit="onPreviewSubmit">
                    <template #footer="{ submit }">
                      <div
                        class="tw:flex tw:justify-end tw:mt-5 tw:pt-4 tw:border-t tw:border-divider"
                      >
                        <BaseButton variant="primary" size="lg" @click="submit">
                          Submit (preview)
                        </BaseButton>
                      </div>
                    </template>
                  </DynamicForm>
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Right Sidebar - Field Config -->
        <Transition name="slide-right">
          <aside
            v-if="rightDrawerOpen"
            class="tw:w-96 tw:border-l tw:border-divider tw:bg-sidebar tw:flex! tw:flex-col tw:shrink-0 tw:overflow-hidden"
          >
            <div
              class="tw:flex tw:items-center tw:justify-between tw:px-4 tw:py-3 tw:border-b tw:border-divider tw:bg-main/50"
            >
              <div class="tw:text-lg tw:font-bold tw:text-on-sidebar">Field Settings</div>
              <button
                class="tw:p-2 tw:rounded-lg tw:text-secondary tw:hover:bg-main-hover tw:transition-colors"
                @click="closeRightDrawer"
              >
                <IconX :size="20" />
              </button>
            </div>
            <div class="tw:flex tw:flex-col tw:grow tw:overflow-y-auto">
              <FormFieldConfig v-model:field="selectedField" :path="selectedFieldPath" />
            </div>
          </aside>
        </Transition>
      </div>
    </div>

    <!-- JSON Dialog -->
    <BaseDialog v-model="showJsonDialog" title="Form Schema JSON" maxWidth="full">
      <template #default>
        <div class="tw:grow tw:overflow-hidden tw:p-5">
          <div
            class="tw:h-full tw:bg-main tw:rounded-2xl tw:border tw:border-divider tw:overflow-hidden tw:flex tw:flex-col"
          >
            <div
              class="tw:flex tw:items-center tw:justify-between tw:px-4 tw:py-2 tw:bg-divider/20 tw:border-b tw:border-divider"
            >
              <div class="ds-label-sm tw:text-secondary">Schema Output</div>
              <button
                class="tw:flex tw:items-center tw:gap-1 tw:px-3 tw:py-1.5 tw:text-primary tw:rounded-lg tw:hover:bg-primary/10 tw:transition-colors tw:text-sm tw:font-medium"
                @click="copyJson"
              >
                <IconCopy :size="16" />
                Copy JSON
              </button>
            </div>
            <pre
              class="tw:flex-1 tw:p-4 tw:overflow-auto tw:font-mono tw:text-sm tw:leading-relaxed tw:text-on-main"
            ><code>{{ jsonContent }}</code></pre>
          </div>
        </div>
      </template>
    </BaseDialog>

    <!-- Clear Confirmation Dialog -->
  </div>
</template>

<style lang="scss" scoped>
/* Slide transitions for sidebars */
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-left-enter-from,
.slide-left-leave-to {
  width: 0 !important;
  opacity: 0;
  transform: translateX(-20px);
}

.slide-right-enter-from,
.slide-right-leave-to {
  width: 0 !important;
  opacity: 0;
  transform: translateX(20px);
}
</style>
