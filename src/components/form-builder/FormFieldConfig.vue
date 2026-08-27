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
import { REPORTABLE_TYPES } from '@/utils/reportingKey'

const props = defineProps({
  // Sibling lookup fields for cascading config (see ConfigLookup).
  siblingLookups: { type: Array, default: () => [] },
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
  // Module templates only: show the per-field Scoring sub-panel (stored on
  // field.scoring). Off for plain forms / log books / workflow steps where the
  // scoring engine never runs.
  showScoring: {
    type: Boolean,
    default: false,
  },
  // Surface the per-field "Report on this field" sub-panel (stored on
  // field.reporting). Independent of showScoring on purpose: scoring is a
  // module-template feature, whereas projecting an answer into analytics is
  // meaningful on any form whose records are kept.
  showReporting: {
    type: Boolean,
    default: false,
  },
  // Reporting keys already used by OTHER fields on this template, so the panel
  // can refuse a clash while the author is typing rather than at save.
  takenKeys: {
    type: Array,
    default: () => [],
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

// Input types that can contribute to a module record's weighted score.
const SCORABLE_TYPES = new Set([
  'checkbox',
  'toggle',
  'select',
  'radio',
  'optionGroup',
  'number',
  'slider',
  'rating',
  'textarea',
  'textEditor',
  'file',
])
const isScorable = computed(() => props.showScoring && SCORABLE_TYPES.has(field.value?.type))

// Input types whose answer resolves to exactly one typed value (number / text /
// date / boolean) and can therefore be projected into analytics. Repeating and
// tabular types are excluded — one row per (record, key) has no honest reading
// of a repeater, and projecting its first row would quietly answer a different
// question than the author asked. The set is defined once in
// utils/reportingKey.js and mirrored from the backend's isReportableType.
//
// A field inside a REPEATING GROUP is excluded: a repeater holds one answer per
// row and the projection stores one value per record, so there is nothing single
// to record. The backend refuses it too — but it must not be offered here in the
// first place, because a tickbox that saves cleanly and then measures nothing is
// worse than one that is absent. The repeater's own children live under a
// `.template.` path segment, which is the only signal this panel has for where
// it sits in the tree.
const insideRepeater = computed(() => String(props.path || '').includes('.template.'))
const isReportable = computed(
  () =>
    props.showReporting &&
    !insideRepeater.value &&
    REPORTABLE_TYPES.has(field.value?.type),
)

// Heading field settings — segmented-control options.
const HEADING_SIZES = [
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
  { value: 'small', label: 'Small' },
]
const HEADING_ALIGNS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

// Workflow setting — when this template is a module, each section with a step
// type becomes a workflow step on Start (a synthesized, non-reusable workflow
// whose step form schema is the section's own fields).
//   ACTION   = the section's input fields are editable when the step is assigned.
//   APPROVAL = the assignee approves (Approve / Reject), no form fields.
const STEP_TYPES = [
  { id: 'NONE', name: 'Not a step' },
  { id: 'ACTION', name: 'Action — assignee completes this section' },
  { id: 'APPROVAL', name: 'Approval — assignee signs off' },
  { id: 'DELAY', name: 'Delay — wait, then verify (effectiveness check)' },
]
const APPROVAL_RULES = [
  { id: 'ALL', name: 'All — every approver must approve' },
  { id: 'ANY', name: 'Any — one approver is enough' },
]
const stepType = computed({
  // Treat the legacy 'FILL' value as ACTION.
  get: () => {
    const t = field.value?.routing?.type
    return t === 'FILL' ? 'ACTION' : t || 'NONE'
  },
  set: (v) => {
    if (v === 'NONE') {
      field.value.routing = undefined
    } else {
      field.value.routing = { ...(field.value.routing || {}), type: v }
    }
  },
})
const approvalRule = computed({
  get: () => field.value?.routing?.approvalRule || 'ALL',
  set: (v) => {
    field.value.routing = { ...(field.value.routing || {}), approvalRule: v }
  },
})
const delayDays = computed({
  get: () => field.value?.routing?.delayDays ?? 30,
  set: (v) => {
    field.value.routing = {
      ...(field.value.routing || {}),
      delayDays: Math.max(1, Number(v) || 30),
    }
  },
})
const capturesEffectiveness = computed({
  // Default ON — a delay whose completion records no verdict is rarely what
  // a quality module wants (mirrors CAPA's effectiveness-as-delay).
  get: () => field.value?.routing?.capturesEffectiveness !== false,
  set: (v) => {
    field.value.routing = { ...(field.value.routing || {}), capturesEffectiveness: !!v }
  },
})
const stepRoles = computed({
  get: () => {
    const r = field.value?.routing
    if (r?.roles?.length) return r.roles
    return r?.assigneeRole ? [r.assigneeRole] : []
  },
  set: (v) => {
    field.value.routing = { ...(field.value.routing || {}), roles: v, assigneeRole: undefined }
  },
})
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
        <BaseText variant="overline" class="tw:block tw:mb-3 tw:pb-2 tw:border-b tw:border-divider">
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

        <!-- Lookup (entity-backed) Settings -->
        <ConfigLookup
          v-if="field.type === 'lookup'"
          v-model:field="field"
          :siblingLookups="siblingLookups"
        />

        <!-- File Settings -->
        <ConfigFile v-if="field.type === 'file'" v-model:field="field" />

        <!-- Email Settings -->
        <ConfigEmail v-if="field.type === 'email'" v-model:field="field" />

        <!-- Phone Settings -->
        <ConfigPhone v-if="field.type === 'phone'" v-model:field="field" />

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

          <!-- Workflow setting — only meaningful when this template is a module.
               Each section with a step type becomes a workflow step (in section
               order) when a record is Started. -->
          <div class="tw:mt-3 tw:flex tw:flex-col tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
            <label class="tw:text-sm tw:font-medium tw:text-on-main">Workflow setting</label>
            <!-- Was <BaseSelectMenu> — a component that does not exist, so
                 Vue rendered NOTHING and the label sat over an empty gap
                 (reported 2026-08-26). BaseSelect is the real primitive. -->
            <BaseField label="Step type">
              <BaseSelect
                v-model="stepType"
                :options="STEP_TYPES"
                optionLabel="name"
                optionValue="id"
                :required="true"
              />
            </BaseField>

            <template v-if="stepType === 'APPROVAL'">
              <BaseField label="Approval rule">
                <BaseSelect
                  v-model="approvalRule"
                  :options="APPROVAL_RULES"
                  optionLabel="name"
                  optionValue="id"
                  :required="true"
                />
              </BaseField>
              <p class="tw:text-xs tw:text-secondary">
                The assignee gets Approve / Reject when the step is initiated.
              </p>
            </template>
            <p v-else-if="stepType === 'ACTION'" class="tw:text-xs tw:text-secondary">
              This section's fields are editable for the assignee when the step is initiated.
            </p>

            <template v-if="stepType === 'DELAY'">
              <BaseField label="Wait (days)">
                <BaseTextInput v-model.number="delayDays" type="number" min="1" />
              </BaseField>
              <BaseCheckbox v-model="capturesEffectiveness">
                Capture an effectiveness verdict on completion
              </BaseCheckbox>
              <p class="tw:text-xs tw:text-secondary">
                The step parks until the wait elapses, then the assignee completes it — recording
                whether the actions were effective when the verdict is on. Same machinery as the
                CAPA effectiveness check.
              </p>
            </template>

            <BaseField v-if="stepType !== 'NONE'" label="Roles (optional)">
              <RoleSelectMenu v-model="stepRoles" multiple />
            </BaseField>
          </div>
        </template>

        <!-- Row Settings -->
        <template v-if="field.type === 'row'">
          <BaseSelect
            :modelValue="field.colClass"
            :options="colClassItems"
            optionLabel="name"
            optionValue="id"
            :required="true"
            placeholder="Select Item Width"
            @update:modelValue="updateRowColClass"
          />
          <p class="tw:text-xs tw:text-secondary tw:mt-1">
            Sets the width for all items in this row
          </p>
        </template>

        <template v-if="field.type === 'repeater'">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <div>
              <label class="tw:text-sm tw:font-medium tw:text-secondary tw:mb-1 tw:block">
                Layout
              </label>
              <div class="tw:flex tw:gap-1 tw:bg-main-hover tw:rounded-lg tw:p-1">
                <button
                  v-for="opt in [
                    { v: 'table', l: 'Table' },
                    { v: 'cards', l: 'Cards' },
                  ]"
                  :key="opt.v"
                  type="button"
                  class="tw:flex-1 tw:px-3 tw:py-1.5 tw:text-sm tw:rounded-md tw:transition-colors"
                  :class="
                    (field.layout || 'cards') === opt.v
                      ? 'tw:bg-main tw:text-primary tw:font-medium tw:shadow-sm'
                      : 'tw:text-secondary tw:hover:text-on-main'
                  "
                  @click="field.layout = opt.v"
                >
                  {{ opt.l }}
                </button>
              </div>
              <p class="tw:text-xs tw:text-secondary tw:mt-1">
                Table shows the item label as a fixed first column; Cards stacks each item.
              </p>
            </div>
            <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
              <BaseTextInput v-model.number="field.minItems" type="number" label="Min Items" />
              <BaseTextInput v-model.number="field.maxItems" type="number" label="Max Items" />
            </div>
            <BaseTextInput v-model="field.addLabel" label="Add Button Label" />
            <BaseTextInput v-model="field.itemLabel" label="Item Label" />
            <!-- The fixed "Product 1 / Product 2" first column. Off = the
                 table starts straight at the data columns. -->
            <BaseCheckbox
              :modelValue="field.showRowLabels !== false"
              label="Show row label column"
              @update:modelValue="(v) => (field.showRowLabels = v)"
            />
          </div>
        </template>

        <!-- Checklist Settings -->
        <ConfigChecklist v-if="field.type === 'checklist'" v-model:field="field" />

        <!-- Table Style — shared by Checklist and Input Table -->
        <ConfigTableStyle
          v-if="field.type === 'checklist' || field.widget === 'inputTable'"
          v-model:field="field"
        />

        <!-- Datetime Settings -->
        <template v-if="field.type === 'datetime'">
          <BaseSelect
            v-model="field.mode"
            :options="datetimeModeItems"
            optionLabel="name"
            optionValue="id"
            :required="true"
            placeholder="Select Mode"
          />
          <p class="tw:text-xs tw:text-secondary tw:mt-1">Format for date/time selection</p>

          <div class="tw:mt-3 tw:flex tw:flex-col tw:gap-2 tw:pt-3 tw:border-t tw:border-divider">
            <BaseCheckbox v-model="field.defaultToday">
              Default new entries to
              {{ field.mode === 'time' ? 'the current time' : "today's date" }}
            </BaseCheckbox>
            <template v-if="field.mode !== 'time'">
              <BaseCheckbox v-model="field.noPastDates">Don't allow past dates</BaseCheckbox>
              <BaseCheckbox v-model="field.noFutureDates">Don't allow future dates</BaseCheckbox>
            </template>
          </div>
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
            <RiskAssessmentTemplateSelectMenu
              v-model="field.riskAssessmentTemplateId"
              :required="true"
            />
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
              <span class="tw:bg-main tw:rounded tw:px-1">#</span>
              to mention a document and create a clickable link.
            </p>
            <div class="tw:border tw:border-divider tw:rounded-md tw:overflow-hidden">
              <BaseRichTextEditor v-model="field.html" />
            </div>
          </BaseField>
        </template>

        <!-- Heading Settings — heading + subheading text, size + alignment. -->
        <template v-if="field.type === 'header'">
          <div class="tw:flex tw:flex-col tw:gap-3">
            <BaseTextInput v-model="field.text" label="Heading Text" placeholder="Heading" />
            <BaseTextInput
              v-model="field.subtext"
              label="Subheading Text"
              placeholder="Add smaller text below the heading"
            />
            <div>
              <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1.5">
                Heading Size
              </label>
              <div class="tw:flex tw:gap-1 tw:p-1 tw:bg-main-hover tw:rounded-lg">
                <button
                  v-for="opt in HEADING_SIZES"
                  :key="opt.value"
                  type="button"
                  class="tw:flex-1 tw:py-1.5 tw:text-sm tw:font-medium tw:rounded-md tw:transition-colors"
                  :class="
                    (field.size || 'large') === opt.value
                      ? 'tw:bg-main tw:text-primary tw:shadow-sm'
                      : 'tw:text-secondary tw:hover:text-on-main'
                  "
                  @click="field.size = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>
            <div>
              <label class="tw:block tw:text-sm tw:font-medium tw:text-on-main tw:mb-1.5">
                Text Alignment
              </label>
              <div class="tw:flex tw:gap-1 tw:p-1 tw:bg-main-hover tw:rounded-lg">
                <button
                  v-for="opt in HEADING_ALIGNS"
                  :key="opt.value"
                  type="button"
                  class="tw:flex-1 tw:py-1.5 tw:text-sm tw:font-medium tw:rounded-md tw:transition-colors"
                  :class="
                    (field.align || 'center') === opt.value
                      ? 'tw:bg-main tw:text-primary tw:shadow-sm'
                      : 'tw:text-secondary tw:hover:text-on-main'
                  "
                  @click="field.align = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Scoring (module templates only) -->
      <ConfigFieldScoring v-if="isScorable" v-model:field="field" />

      <!-- Analytics: project this answer into a metric -->
      <ConfigFieldReporting
        v-if="isReportable"
        v-model:field="field"
        :takenKeys="takenKeys"
      />

      <!-- Styling -->
      <ConfigStyling v-model:field="field" />
    </div>
  </div>
</template>
