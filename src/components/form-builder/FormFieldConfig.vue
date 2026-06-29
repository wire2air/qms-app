<script setup>
import { IconHandClick } from '@tabler/icons-vue'
import { computed } from 'vue'
import { db } from '@models/index'
import {
  TYPE_SETTINGS_TYPES,
  NUMBER_TYPES,
  OPTIONS_TYPES,
  COL_CLASS_OPTIONS,
  DATETIME_MODE_OPTIONS,
} from '@/constants/formBuilderConfig'

const props = defineProps({
  path: {
    type: String,
    default: null,
  },
  // Custom Fields module only: show a free-text "Section" placement input on
  // input fields (stored on field.section). Default off — forms/workflow
  // builders never render it.
  showSectionPlacement: {
    type: Boolean,
    default: false,
  },
})

const field = defineModel('field', {
  type: Object,
  default: () => ({}),
})

// Layout containers don't take a section-placement value — only actual inputs.
const LAYOUT_TYPES = new Set(['section', 'row', 'column', 'separator'])
const canPlaceInSection = computed(
  () => props.showSectionPlacement && !LAYOUT_TYPES.has(field.value?.type),
)

const hasTypeSettings = computed(() => TYPE_SETTINGS_TYPES.has(field.value?.type))
const isNumberType = computed(() => NUMBER_TYPES.has(field.value?.type))
const hasOptions = computed(() => OPTIONS_TYPES.has(field.value?.type))

// When the admin picks an RCA / Risk template, embed a snapshot of the
// template content onto the field definition. The runtime FE field
// components (RcaField, RiskAssessmentField) prefer the embedded
// snapshot over an FK lookup, which lets supplier users render the
// form without rcaTemplates:read / riskAssessmentTemplates:read RLS
// grants and locks the template version at workflow-creation time.
// See backend/api/services/bootstrapCompanyDefaults.js rcaStepSchema
// for the embedded shape.
watch(
  () => field.value?.rcaTemplateId,
  async (id) => {
    if (field.value?.type !== 'rca' || !id) {
      if (field.value && field.value.rcaTemplate) delete field.value.rcaTemplate
      return
    }
    const tpl = await db.RcaTemplate.findByPk(id)
    if (!tpl) return
    field.value.rcaTemplate = { id: tpl.id, name: tpl.name, config: tpl.config }
  },
  { immediate: true },
)

watch(
  () => field.value?.riskAssessmentTemplateId,
  async (id) => {
    if (field.value?.type !== 'riskAssessment' || !id) {
      if (field.value && field.value.riskAssessmentTemplate) {
        delete field.value.riskAssessmentTemplate
      }
      return
    }
    const tpl = await db.RiskAssessmentTemplate.findByPk(id)
    if (!tpl) return
    field.value.riskAssessmentTemplate = {
      id: tpl.id,
      name: tpl.name,
      config: tpl.config,
    }
  },
  { immediate: true },
)

const colClassItems = computed(() =>
  COL_CLASS_OPTIONS.map((opt) => ({ id: opt.value, name: opt.label })),
)

const datetimeModeItems = computed(() =>
  DATETIME_MODE_OPTIONS.map((opt) => ({ id: opt.value, name: opt.label })),
)

function updateRowColClass(value) {
  field.value.colClass = value
  if (field.value.children) {
    field.value.children.forEach((child) => {
      child.class = value
    })
  }
}
</script>

<template>
  <div>
    <div
      v-if="!field"
      class="tw:flex tw:flex-col tw:items-center tw:justify-center tw:p-6 tw:text-center"
    >
      <IconHandClick :size="40" class="tw:text-secondary/40 tw:mb-4" />
      <div class="tw:text-sm tw:text-secondary">Select a field to configure</div>
    </div>

    <div v-else class="tw:p-3 tw:flex tw:flex-col tw:gap-6 tw:h-full">
      <!-- Basic Settings -->
      <ConfigBasic v-model:field="field" />

      <!-- Section placement (Custom Fields module only). Free text — the admin
           pastes a card/section title from the entity's detail page; the field
           is grouped there when supported, otherwise it falls into the single
           "Additional information" card (v1 always uses the single card). -->
      <BaseField
        v-if="canPlaceInSection"
        v-slot="{ id: fieldId }"
        label="Section (optional)"
        hint="Paste a section title from the entity page to group this field there. Leave blank for the Additional information card."
      >
        <BaseTextInput
          :id="fieldId"
          v-model="field.section"
          placeholder="e.g. Additional information"
          size="sm"
        />
      </BaseField>

      <!-- State Settings -->
      <ConfigState v-model:field="field" />

      <div v-if="hasTypeSettings" class="tw:mb-4 tw:last:mb-0">
        <BaseText
          variant="overline"
          class="tw:block tw:mb-3 tw:pb-2 tw:border-b tw:border-divider"
        >
          {{ field.type }} Settings
        </BaseText>

        <!-- Number/Slider Settings -->
        <template v-if="isNumberType">
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:lg:grid-cols-3 tw:gap-3">
            <BaseTextInput v-model.number="field.min" type="number" label="Min" size="sm" />
            <BaseTextInput v-model.number="field.max" type="number" label="Max" size="sm" />
            <BaseTextInput v-model.number="field.step" type="number" label="Step" size="sm" />
          </div>
        </template>

        <!-- Select/Radio/OptionGroup Settings -->
        <ConfigOptions v-if="hasOptions" v-model:field="field" />

        <!-- File Settings -->
        <ConfigFile v-if="field.type === 'file'" v-model:field="field" />

        <!-- Rating Settings -->
        <template v-if="field.type === 'rating'">
          <BaseTextInput v-model.number="field.max" type="number" label="Max Stars" />
        </template>

        <!-- Section Settings -->
        <template v-if="field.type === 'section'">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <BaseCheckbox v-model="field.collapsible">Collapsible</BaseCheckbox>
            <BaseCheckbox v-if="field.collapsible" v-model="field.collapsed">
              Start collapsed
            </BaseCheckbox>
          </div>
        </template>

        <!-- Row Settings -->
        <template v-if="field.type === 'row'">
          <BaseSelectMenu
            :modelValue="field.colClass"
            :items="colClassItems"
            :required="true"
            @update:modelValue="updateRowColClass"
          >
            <template #button>
              <span class="tw:text-sm tw:font-medium">
                {{
                  colClassItems.find((i) => i.id === field.colClass)?.name || 'Select Item Width'
                }}
              </span>
            </template>
          </BaseSelectMenu>
          <p class="tw:text-xs tw:text-secondary tw:mt-1">
            Sets the width for all items in this row
          </p>
        </template>

        <template v-if="field.type === 'repeater'">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
              <BaseTextInput v-model.number="field.minItems" type="number" label="Min Items" />
              <BaseTextInput v-model.number="field.maxItems" type="number" label="Max Items" />
            </div>
            <BaseTextInput v-model="field.addLabel" label="Add Button Label" />
            <BaseTextInput v-model="field.itemLabel" label="Item Label" />
          </div>
        </template>

        <!-- Checklist Settings -->
        <ConfigChecklist v-if="field.type === 'checklist'" v-model:field="field" />

        <!-- Datetime Settings -->
        <template v-if="field.type === 'datetime'">
          <BaseSelectMenu v-model="field.mode" :items="datetimeModeItems" :required="true">
            <template #button>
              <span class="tw:text-sm tw:font-medium">
                {{ datetimeModeItems.find((i) => i.id === field.mode)?.name || 'Select Mode' }}
              </span>
            </template>
          </BaseSelectMenu>
          <p class="tw:text-xs tw:text-secondary tw:mt-1">Format for date/time selection</p>
        </template>

        <!-- RCA Settings -->
        <template v-if="field.type === 'rca'">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <BaseField
              label="RCA Template"
              hint="The template defines branch labels and analysis structure. Users add causes during investigation."
            >
              <RcaTemplateSelectMenu v-model="field.rcaTemplateId" :required="true" />
            </BaseField>
            <BaseField
              v-slot="{ id: fieldId }"
              label="Problem Source Field"
              hint="Field name in this form whose value appears as the problem statement in the fishbone diagram."
            >
              <BaseTextInput
                :id="fieldId"
                v-model="field.problemField"
                placeholder="e.g. problemDescription"
                size="sm"
              />
            </BaseField>
          </div>
        </template>

        <!-- Risk Assessment Settings -->
        <template v-if="field.type === 'riskAssessment'">
          <BaseField
            label="Risk Assessment Template"
            hint="The template defines the likelihood/severity matrix and risk level colors."
          >
            <RiskAssessmentTemplateSelectMenu v-model="field.riskAssessmentTemplateId" :required="true" />
          </BaseField>
        </template>

        <!-- Instructions Settings — full TipTap editor on field.html.
             The mention `#` shortcut is enabled, so authors can link
             SOPs / work-instructions inline; the same editor is used
             by the document body field, so behaviour matches across
             the app. -->
        <template v-if="field.type === 'instructions'">
          <BaseField label="Content">
            <p class="tw:text-xs tw:text-secondary tw:mb-2">
              Tip: type
              <span class="tw:font-mono tw:bg-main tw:rounded tw:px-1">#</span>
              to mention a document and create a clickable link.
            </p>
            <div class="tw:border tw:border-divider tw:rounded-md tw:overflow-hidden">
              <BaseRichTextEditor v-model="field.html" />
            </div>
          </BaseField>
        </template>
      </div>

      <!-- Styling -->
      <ConfigStyling v-model:field="field" />
    </div>
  </div>
</template>
