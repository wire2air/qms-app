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
  IconSparkles,
} from '@tabler/icons-vue'
import { useFormBuilder } from '@/composables/useFormBuilder'
import { canUseAi } from '@/utils/currentSession'
import FormFieldPalette from './FormFieldPalette.vue'
import FormCanvas from './FormCanvas.vue'
import FormFieldConfig from './FormFieldConfig.vue'
import FormAiChatPanel from '@/components/ai/FormAiChatPanel.vue'
import DynamicForm from '@/components/form/DynamicForm.js'
import { otherReportingKeys, reportingKeyError } from '@/utils/reportingKey'

const props = defineProps({
  title: {
    type: String,
    default: 'Form Builder',
  },
  initialSchema: {
    type: Array,
    default: () => [],
  },
  // Custom Fields module only: surfaces an optional free-text "Section"
  // placement input in the field editor (stored on field.section). Off by
  // default so the forms / workflow / complaint builders are unaffected.
  showSectionPlacement: {
    type: Boolean,
    default: false,
  },
  // Module templates only: surface the per-field Scoring sub-panel in the field
  // editor (stored on field.scoring). Off by default so plain forms / log books
  // / workflow-step builders are unaffected.
  showScoring: {
    type: Boolean,
    default: false,
  },
  // Surface the per-field "Report on this field" sub-panel (stored on
  // field.reporting), which projects the answer into analytics under a stable
  // reporting key. Off by default so existing builders are unaffected.
  showReporting: {
    type: Boolean,
    default: false,
  },
  // Opens the AI assistant docked and ready on mount, for hosts whose entry
  // point IS "build this with AI" (the Form Blocks AI builder). The toggle
  // still works normally afterwards — this only picks the starting state.
  startWithAi: {
    type: Boolean,
    default: false,
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
  hoistChildren,
  moveField,
  selectField,
  clearSelection,
  duplicateField,
  changeFieldKind,
  undo,
  redo,
  canUndo,
  canRedo,
  exportSchema,
  clearSchema,
  applyAiSchema,
} = useFormBuilder(props.initialSchema)

// Field palette open by default — it's the primary tool for building a form,
// so the designer should land with it visible (toggle still collapses it).
const leftDrawerOpen = ref(true)
const rightDrawerOpen = ref(false)
const showPreview = ref(false)
const showJsonDialog = ref(false)
const { confirm } = useConfirm()
const previewData = ref({})

const jsonContent = computed({
  get: () => JSON.stringify(schema.value, null, 2),
  set: () => {},
})


// Sibling lookup fields (name/label/entity), flattened across containers —
// the candidates a cascading lookup can filter by (ConfigLookup).
function collectLookupFields(fields, out = []) {
  for (const f of fields || []) {
    if (f?.type === 'lookup' && f.name && f.lookupEntity && f.lookupEntity !== 'optionSet') {
      out.push({ name: f.name, label: f.label, lookupEntity: f.lookupEntity })
    }
    if (Array.isArray(f?.fields)) collectLookupFields(f.fields, out)
    if (Array.isArray(f?.children)) collectLookupFields(f.children, out)
  }
  return out
}
const siblingLookups = computed(() =>
  collectLookupFields(schema.value?.fields || schema.value || []),
)

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

// Reporting keys in use by every field EXCEPT the one currently being edited, so
// the field editor can refuse a clash as it is typed. Two fields sharing a key
// collide in analytics_field_values and one silently overwrites the other.
const takenReportingKeys = computed(() => otherReportingKeys(schema.value, selectedField.value))

// `seenReportingKeys` is threaded through the recursion rather than created per
// call: a reporting key must be unique across the WHOLE template, and two fields
// in different sections colliding is the likeliest way to hit it.
function validateSchema(fields, seenReportingKeys = new Set()) {
  for (const field of fields) {
    // Check if field has a name
    if (!field.name || field.name.trim() === '') {
      toast.error(`Field "${field.label || field.type}" is missing a name`, {
        caption: 'All fields must have a unique name',
      })
      return false
    }

    // A field marked reportable MUST carry a real reporting key. The backend
    // refuses the save outright (schemas/formTemplates.js) — this exists so the
    // author is told before the round trip, and told why.
    //
    // The key cannot default to the field's own name: names are minted from a
    // counter (`input_1`, `number_3`) and the counter reuses a name as soon as
    // the field holding it is deleted. A metric pointing at a reused name keeps
    // drawing a healthy line over a different field's answers, with no error
    // anywhere. Hence a separate, human-authored key — and hence NOT a rename of
    // the field, since answers are stored under the field name and renaming it
    // would orphan every answer already collected.
    if (field.reporting?.enabled) {
      const key = String(field.reporting.key || '').trim()
      const err = reportingKeyError(key, field.type, [...seenReportingKeys])
      if (err) {
        toast.error(`Reporting key for "${field.label || field.name}"`, { caption: err })
        return false
      }
      seenReportingKeys.add(key)
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
      if (!validateSchema(field.children, seenReportingKeys)) return false
    }

    // Check template (repeater) recursively
    if (field.template && field.template.length > 0) {
      if (!validateSchema(field.template, seenReportingKeys)) return false
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

// ── AI form assistant (chat docked beside the canvas) ────────────────────────
const showAiChat = ref(props.startWithAi && canUseAi.value)
async function handleAiApply(result) {
  const count = Array.isArray(result?.fields) ? result.fields.length : 0
  if (!count) return false
  const hadFields = schema.value?.length > 0
  // Snapshot the current schema so an EDIT preserves untouched (and heavy) fields
  // by name; a fresh generate simply finds no name matches.
  const preserveFrom = hadFields ? JSON.parse(JSON.stringify(schema.value)) : null
  // Applying rewrites the schema — confirm when there's existing work.
  if (hadFields) {
    const ok = await confirm({
      title: 'Apply AI changes?',
      message: `This rewrites the form to the ${count} proposed field${
        count === 1 ? '' : 's'
      }. Fields kept by the AI are preserved; the rest are replaced. You can undo this.`,
      okLabel: 'Apply',
      danger: true,
    })
    if (!ok) return false
  }
  applyAiSchema(result, { preserveFrom })
  toast.success(`Applied ${count} field${count === 1 ? '' : 's'}`)
  return true
}

async function handleAiChatApply({ proposal, onApplied }) {
  const applied = await handleAiApply(proposal)
  if (applied) onApplied?.()
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

            <BaseButton
              v-if="canUseAi"
              :variant="showAiChat ? 'primary' : 'outline'"
              @click="showAiChat = !showAiChat"
            >
              <IconSparkles :size="18" />
              AI Assistant
            </BaseButton>

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
                @configureField="handleSelectField"
                @changeFieldKind="changeFieldKind"
                @removeField="removeField"
                @hoistChildren="hoistChildren"
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
              <FormFieldConfig
                v-model:field="selectedField"
                :path="selectedFieldPath"
                :showSectionPlacement="showSectionPlacement"
                :showScoring="showScoring"
                :siblingLookups="siblingLookups"
                :showReporting="showReporting"
                :takenKeys="takenReportingKeys"
              />
            </div>
          </aside>
        </Transition>

        <!-- AI form assistant (owns all AI wiring; we only react to @apply).
             NO slide-right Transition here: on a child COMPONENT the enter
             classes (width: 0 !important) can stick and freeze the panel at
             sliver width — reproduced headlessly. Plain v-if is reliable.
             Stays mounted while closed (`open` class-swap, not v-if/v-show —
             the root's tw:flex! would beat v-show's inline display) so
             accidentally closing the panel keeps the live conversation. -->
        <FormAiChatPanel
          v-if="canUseAi"
          :open="showAiChat"
          :currentSchema="schema"
          :builderTitle="title"
          @apply="handleAiChatApply"
          @close="showAiChat = false"
        />
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
              <BaseText as="div" variant="overline">Schema Output</BaseText>
              <button
                class="tw:flex tw:items-center tw:gap-1 tw:px-3 tw:py-1.5 tw:text-primary tw:rounded-lg tw:hover:bg-primary/10 tw:transition-colors tw:text-sm tw:font-medium"
                @click="copyJson"
              >
                <IconCopy :size="16" />
                Copy JSON
              </button>
            </div>
            <pre
              class="tw:flex-1 tw:p-4 tw:overflow-auto tw:text-sm tw:leading-relaxed tw:text-on-main"
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
