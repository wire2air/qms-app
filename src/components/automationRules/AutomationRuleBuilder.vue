<script setup>
import { IconPlus, IconTrash } from '@tabler/icons-vue'
import {
  AUTOMATION_OBJECTS,
  AUTOMATION_TRIGGERS,
  fieldsForObject,
  operatorsForField,
  actionsForObject,
  NO_VALUE_OPERATORS,
  LIST_OPERATORS,
  MODULE_ACTIONS,
  moduleOperatorsForField,
  OBJECT_BY_VALUE,
} from '@/utils/automationObjects'
import { required } from '@shared/components/form/validators.js'

const props = defineProps({
  ruleId: { type: String, default: null },
  // Module mode: fix the object type to a module key + supply its fields.
  fixedObjectType: { type: String, default: null },
  moduleFields: { type: Array, default: null },
})
const emit = defineEmits(['saved'])
const open = defineModel({ type: Boolean, default: false })
const isModuleMode = computed(() => !!props.fixedObjectType)
const toast = useToast()
const saving = ref(false)
const formRef = ref(null)
const pendingClose = ref(null)

const existing = useLiveQueryWithDeps(
  [() => props.ruleId],
  async (db, [id]) => (id ? db.AutomationRule.findByPk(id) : null),
  { models: ['AutomationRule'], initial: null },
)

function blankDraft() {
  return {
    name: '',
    objectType: props.fixedObjectType || 'QualityEvent',
    trigger: 'CREATED',
    logic: 'AND',
    conditions: [],
    actions: [],
    siteIds: [],
    departmentIds: [],
    isActive: true,
  }
}
const draft = ref(blankDraft())

// Tracks which rule the draft has been hydrated from, so we hydrate exactly
// once per open (after the live query resolves) without clobbering in-progress
// edits on later sync updates.
const hydratedFor = ref(null)

function hydrateDraft() {
  if (props.ruleId && existing.value) {
    const r = existing.value
    draft.value = {
      name: r.name,
      objectType: r.objectType,
      trigger: r.trigger,
      logic: r.conditionTree?.logic || 'AND',
      conditions: Array.isArray(r.conditionTree?.conditions)
        ? r.conditionTree.conditions.map((c) => ({ ...c }))
        : [],
      actions: Array.isArray(r.actions)
        ? r.actions.map((a) => ({ ...a, config: { ...(a.config || {}) } }))
        : [],
      siteIds: [...(r.siteIds || [])],
      departmentIds: [...(r.departmentIds || [])],
      isActive: r.isActive,
    }
    hydratedFor.value = props.ruleId
  } else if (!props.ruleId) {
    draft.value = blankDraft()
    hydratedFor.value = null
  }
}

watch(open, (v) => {
  if (!v) {
    hydratedFor.value = null
    return
  }
  hydrateDraft()
})

// The live query returns null first, then the record. Re-hydrate once it
// arrives so the edit form shows the rule's actual saved data.
watch(existing, () => {
  if (open.value && props.ruleId && hydratedFor.value !== props.ruleId) hydrateDraft()
})

const fields = computed(() =>
  isModuleMode.value ? props.moduleFields || [] : fieldsForObject(draft.value.objectType),
)
const availableActions = computed(() =>
  isModuleMode.value ? MODULE_ACTIONS : actionsForObject(draft.value.objectType),
)

// BaseSelect maps via optionLabel/optionValue; the source arrays already carry
// { label } + { value } (fields use { key }), so pass them straight through.
const logicOptions = [
  { value: 'AND', label: 'Match ALL (AND)' },
  { value: 'OR', label: 'Match ANY (OR)' },
]

// ── Type-aware condition value input ─────────────────────────────────────────
// enum/option fields (Status, form dropdowns) get a real select — multi when the
// operator is in/not_in; date fields get a date picker for before/after, and a
// numeric input for the relative-date operators (older_than/within X).
const recordStatuses = useLiveQuery((db) => db.RecordStatus.where().exec(), {
  models: ['RecordStatus'],
  initial: [],
})
// Module records only use this lifecycle subset (DRAFT → PENDING → COMPLETE →
// CLOSED, REJECTED; OPEN is legacy). The other record_statuses — Approved /
// Review / Obsolete — belong to document records, so exclude them. Listed in
// lifecycle order; label comes from the seeded status.
const MODULE_STATUS_IDS = ['DRAFT', 'OPEN', 'PENDING', 'COMPLETE', 'CLOSED', 'REJECTED']
const statusOptions = computed(() =>
  MODULE_STATUS_IDS.map((id) => recordStatuses.value.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => ({ value: s.id, label: s.name })),
)
function fieldFor(key) {
  return fields.value.find((f) => f.key === key)
}
/**
 * Real options for a condition's value, so "Status is …" is a dropdown rather
 * than a text box.
 *
 * It used to return [] for everything outside admin-defined modules, so on
 * CAPA / NC / QC / Audits the status, site, supplier and item conditions all
 * fell through to a free-text input. That asked people to type
 * RETURN_TO_SUPPLIER from memory, and a typo produced a rule that silently
 * never matched — the worst failure mode an automation rule has.
 *
 * Both sources are declared on the object registry: `statusModel` names the
 * status lookup, `lookup` names the model behind a FK field. Nothing is
 * hardcoded here; adding a status or a site shows up without a code change.
 */
const objectStatuses = useLiveQueryWithDeps(
  [() => OBJECT_BY_VALUE[draft.value.objectType]?.statusModel],
  async (db, [modelName]) => {
    if (!modelName || !db[modelName]) return []
    const rows = await db[modelName].where().exec()
    return rows
      .slice()
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map((r) => ({ value: r.id, label: r.name || r.id }))
  },
  { initial: [] },
)

// Every lookup model the current object's fields reference, resolved once and
// keyed by model name — a condition row cannot query on its own.
const lookupOptions = useLiveQueryWithDeps(
  [() => fields.value.map((f) => f.lookup).filter(Boolean).sort().join(',')],
  async (db, [names]) => {
    const out = {}
    for (const name of [...new Set((names || '').split(',').filter(Boolean))]) {
      if (!db[name]) continue
      const rows = await db[name].where().exec()
      // name / title / label — lookups are not consistent about which they use.
      out[name] = rows.map((r) => ({ value: r.id, label: r.name || r.title || r.label || r.id }))
    }
    return out
  },
  { initial: {} },
)

function optionsForField(field) {
  if (field?.options?.length) return field.options
  // Admin-defined modules share one lifecycle; keep their existing source.
  if (isModuleMode.value && field?.key === 'status_id') return statusOptions.value
  if (field?.key === 'status_id') return objectStatuses.value
  if (field?.lookup) return lookupOptions.value[field.lookup] ?? []
  return []
}
const DATE_PICK_OPERATORS = new Set(['before', 'after'])
function valueKind(cond) {
  if (NO_VALUE_OPERATORS.has(cond.operator)) return 'none'
  const field = fieldFor(cond.field)
  const type = field?.type
  if (type === 'date') return DATE_PICK_OPERATORS.has(cond.operator) ? 'date' : 'number'
  if ((type === 'enum' || type === 'lookup') && optionsForField(field).length) return 'select'
  if (type === 'number') return cond.operator === 'between' ? 'text' : 'number'
  return 'text'
}
// Reset value to the right empty shape for the current field/operator.
function resetCondValue(cond) {
  if (LIST_OPERATORS.has(cond.operator)) cond.value = []
  else if (valueKind(cond) === 'date') cond.value = null
  else cond.value = ''
}

function addCondition() {
  const f = fields.value[0]
  const cond = {
    field: f?.key || '',
    operator: operatorsFor(f?.key)[0]?.value || 'is',
    value: '',
  }
  resetCondValue(cond)
  draft.value.conditions.push(cond)
}
function removeCondition(i) {
  draft.value.conditions.splice(i, 1)
}
function operatorsFor(fieldKey) {
  return isModuleMode.value
    ? moduleOperatorsForField(props.moduleFields, fieldKey)
    : operatorsForField(draft.value.objectType, fieldKey)
}
function onFieldChange(cond) {
  cond.operator = operatorsFor(cond.field)[0]?.value || 'is'
  resetCondValue(cond)
}
function onOperatorChange(cond) {
  resetCondValue(cond)
}

// CREATE_TASK config UI options.
const ASSIGN_TO_OPTIONS = [
  { value: 'OWNER', label: 'Owner / Assignee' },
  { value: 'REQUESTER', label: 'Requester / Creator' },
  { value: 'USERS', label: 'Specific user(s)' },
  { value: 'GROUP', label: 'Team / Group' },
]
const TASK_KIND_OPTIONS = [
  { value: 'ACTION', label: 'Action (to-do)' },
  { value: 'EFFECTIVENESS_CHECK', label: 'Effectiveness Check' },
  { value: 'REVIEW', label: 'Review' },
  { value: 'ACK', label: 'Acknowledgement' },
]

function defaultActionConfig(type) {
  if (type === 'CREATE_TASK') {
    return { assignTo: 'OWNER', taskKindId: 'ACTION', userIds: [], groupIds: [], dueOffsetDays: '', note: '' }
  }
  return {}
}
function addAction(type) {
  if (!type) return
  draft.value.actions.push({ type, config: defaultActionConfig(type) })
}
function removeAction(i) {
  draft.value.actions.splice(i, 1)
}
const newActionType = ref(null)

// When the object changes, reset conditions/actions that may no longer apply.
watch(
  () => draft.value.objectType,
  () => {
    draft.value.conditions = []
    draft.value.actions = draft.value.actions.filter((a) =>
      availableActions.value.some((x) => x.value === a.type),
    )
  },
)

function normalizeValue(cond) {
  if (NO_VALUE_OPERATORS.has(cond.operator)) return undefined
  if (LIST_OPERATORS.has(cond.operator)) {
    const arr = Array.isArray(cond.value)
      ? cond.value
      : String(cond.value ?? '').split(',')
    return arr.map((s) => String(s).trim()).filter(Boolean)
  }
  return cond.value
}

const createRule = useLiveMutation(async (db, payload) => {
  const r = db.AutomationRule.create(payload)
  await r.save()
  return r
})

function handleSave(close) {
  pendingClose.value = close ?? null
  formRef.value?.submit()
}

async function onValidSubmit() {
  saving.value = true
  try {
    const conditionTree = {
      logic: draft.value.logic,
      conditions: draft.value.conditions
        .filter((c) => c.field && c.operator)
        .map((c) => {
          const v = normalizeValue(c)
          return v === undefined
            ? { field: c.field, operator: c.operator }
            : { field: c.field, operator: c.operator, value: v }
        }),
    }
    const payload = {
      name: draft.value.name.trim(),
      objectType: draft.value.objectType,
      trigger: draft.value.trigger,
      conditionTree,
      actions: draft.value.actions,
      siteIds: draft.value.siteIds,
      departmentIds: draft.value.departmentIds,
      isActive: draft.value.isActive,
    }
    if (props.ruleId && existing.value) {
      Object.assign(existing.value, payload)
      await existing.value.save()
      toast.success('Rule updated')
    } else {
      await createRule(payload)
      toast.success('Rule created')
    }
    pendingClose.value?.()
    emit('saved')
  } catch (e) {
    toast.error(e.message || 'Failed to save rule')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <BaseDialog
    v-model="open"
    :title="ruleId ? 'Edit Automation Rule' : 'New Automation Rule'"
    maxWidth="2xl"
  >
    <BaseForm ref="formRef" hideFooter @submit="onValidSubmit">
      <div class="tw:flex tw:flex-col tw:gap-4 tw:p-1">
        <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
          <BaseField
            v-slot="{ id }"
            label="Rule name"
            required
            :value="draft.name"
            :rules="[required()]"
          >
            <BaseTextInput
              :id="id"
              v-model="draft.name"
              placeholder="e.g. Notify QA on critical events"
            />
          </BaseField>
          <BaseField label="Active">
            <div class="tw:flex tw:items-center tw:gap-2 tw:h-9">
              <BaseSwitch v-model="draft.isActive" />
              <span class="tw:text-xs tw:text-secondary">Rule is evaluated when on</span>
            </div>
          </BaseField>
          <BaseField v-if="!isModuleMode" label="Object">
            <BaseSelect
              v-model="draft.objectType"
              :options="AUTOMATION_OBJECTS"
              :required="true"
              :searchable="false"
            />
          </BaseField>
          <BaseField label="Trigger">
            <BaseSelect
              v-model="draft.trigger"
              :options="AUTOMATION_TRIGGERS"
              :required="true"
              :searchable="false"
            />
          </BaseField>
        </div>

        <!-- Conditions -->
        <div class="tw:border tw:border-divider tw:rounded-lg tw:p-3">
          <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
            <div class="tw:flex tw:items-center tw:gap-2">
              <span
                class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
                >Conditions</span
              >
              <div class="tw:w-44">
                <BaseSelect
                  v-model="draft.logic"
                  :options="logicOptions"
                  :required="true"
                  :searchable="false"
                />
              </div>
            </div>
            <BaseButton variant="outline" size="sm" @click="addCondition">
              <IconPlus :size="14" class="tw:mr-1" /> Add condition
            </BaseButton>
          </div>
          <p v-if="!draft.conditions.length" class="tw:text-xs tw:text-secondary tw:italic">
            No conditions — the rule matches every {{ draft.objectType }} for the chosen trigger.
          </p>
          <div
            v-for="(cond, i) in draft.conditions"
            :key="i"
            class="tw:flex tw:items-center tw:gap-2 tw:mb-2"
          >
            <div class="tw:w-40 tw:shrink-0">
              <BaseSelect
                v-model="cond.field"
                :options="fields"
                optionValue="key"
                :required="true"
                @update:modelValue="onFieldChange(cond)"
              />
            </div>
            <div class="tw:w-52 tw:shrink-0">
              <BaseSelect
                v-model="cond.operator"
                :options="operatorsFor(cond.field)"
                :required="true"
                :searchable="false"
                @update:modelValue="onOperatorChange(cond)"
              />
            </div>
            <!-- value — type/operator aware: dropdown for option fields, date
                 picker for before/after, number for relative-date, else text -->
            <BaseSelect
              v-if="valueKind(cond) === 'select'"
              v-model="cond.value"
              :options="optionsForField(fieldFor(cond.field))"
              :multiple="LIST_OPERATORS.has(cond.operator)"
              placeholder="Select value"
              class="tw:flex-1"
            />
            <BaseDateField
              v-else-if="valueKind(cond) === 'date'"
              v-model="cond.value"
              mode="date"
              valueFormat="iso"
              size="sm"
              class="tw:flex-1"
            />
            <BaseTextInput
              v-else-if="valueKind(cond) !== 'none'"
              v-model="cond.value"
              size="sm"
              class="tw:flex-1"
              :placeholder="
                LIST_OPERATORS.has(cond.operator)
                  ? 'comma,separated,values'
                  : valueKind(cond) === 'number'
                    ? 'number'
                    : 'value (code / id / text)'
              "
            />
            <button
              class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-red-600"
              title="Remove"
              @click="removeCondition(i)"
            >
              <IconTrash :size="15" />
            </button>
          </div>
        </div>

        <!-- Actions -->
        <div class="tw:border tw:border-divider tw:rounded-lg tw:p-3">
          <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
            <span class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary">Actions</span>
            <div class="tw:flex tw:items-center tw:gap-2">
              <div class="tw:w-48">
                <BaseSelect
                  v-model="newActionType"
                  :options="availableActions"
                  placeholder="Add action…"
                  :searchable="false"
                />
              </div>
              <BaseButton
                variant="outline"
                size="sm"
                :disabled="!newActionType"
                @click="
                  () => {
                    addAction(newActionType)
                    newActionType = null
                  }
                "
              >
                <IconPlus :size="14" />
              </BaseButton>
            </div>
          </div>
          <p v-if="!draft.actions.length" class="tw:text-xs tw:text-secondary tw:italic">
            No actions yet — add at least one.
          </p>
          <div
            v-for="(action, i) in draft.actions"
            :key="i"
            class="tw:flex tw:items-start tw:gap-2 tw:mb-2 tw:border-b tw:border-divider tw:pb-2"
          >
            <div class="tw:flex-1">
              <div class="tw:text-sm tw:font-medium tw:text-on-main tw:mb-1">
                {{ availableActions.find((a) => a.value === action.type)?.label || action.type }}
              </div>
              <GroupSelectMenu
                v-if="action.type === 'NOTIFY_GROUP'"
                v-model="action.config.groupIds"
                :multiple="true"
              />
              <UserSelectMenu
                v-else-if="action.type === 'NOTIFY_USER'"
                v-model="action.config.userIds"
                :multiple="true"
              />
              <BaseTextInput
                v-else-if="action.type === 'NOTIFY_EMAIL'"
                v-model="action.config.emailsRaw"
                size="sm"
                placeholder="email1@x.com, email2@y.com"
                @update:modelValue="
                  (v) =>
                    (action.config.emails = String(v || '')
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean))
                "
              />
              <div
                v-else-if="action.type === 'CREATE_TASK'"
                class="tw:flex tw:flex-col tw:gap-2"
              >
                <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-2">
                  <BaseSelect
                    v-model="action.config.assignTo"
                    :options="ASSIGN_TO_OPTIONS"
                    :searchable="false"
                    placeholder="Assign to…"
                  />
                  <BaseSelect
                    v-model="action.config.taskKindId"
                    :options="TASK_KIND_OPTIONS"
                    :searchable="false"
                    placeholder="Task type"
                  />
                </div>
                <UserSelectMenu
                  v-if="action.config.assignTo === 'USERS'"
                  v-model="action.config.userIds"
                  :multiple="true"
                />
                <GroupSelectMenu
                  v-else-if="action.config.assignTo === 'GROUP'"
                  v-model="action.config.groupIds"
                  :multiple="true"
                />
                <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-2">
                  <BaseTextInput
                    v-model="action.config.dueOffsetDays"
                    size="sm"
                    placeholder="Due in (days, optional)"
                  />
                  <BaseTextInput
                    v-model="action.config.note"
                    size="sm"
                    placeholder="Note for assignee (optional)"
                  />
                </div>
              </div>
              <p v-else-if="action.type === 'SEND_SMS'" class="tw:text-xs tw:text-amber-700">
                Requires SMS setup (Twilio). Stored, but won't send until configured.
              </p>
              <p v-else class="tw:text-xs tw:text-secondary">No configuration needed.</p>
            </div>
            <button
              class="tw:p-1.5 tw:rounded tw:text-secondary tw:hover:text-red-600"
              title="Remove"
              @click="removeAction(i)"
            >
              <IconTrash :size="15" />
            </button>
          </div>
        </div>

        <!-- Scope -->
        <div class="tw:border tw:border-divider tw:rounded-lg tw:p-3">
          <span class="tw:text-caption tw:font-semibold tw:uppercase tw:tracking-wider tw:text-secondary"
            >Scope (optional)</span
          >
          <p class="tw:text-xs tw:text-secondary tw:mb-2">Leave empty to apply company-wide.</p>
          <div class="tw:grid tw:grid-cols-1 tw:sm:grid-cols-2 tw:gap-3">
            <BaseField label="Sites">
              <SiteSelectMenu v-model="draft.siteIds" :multiple="true" :required="false" />
            </BaseField>
            <BaseField label="Departments">
              <DepartmentSelectMenu
                v-model="draft.departmentIds"
                :multiple="true"
                :required="false"
              />
            </BaseField>
          </div>
        </div>
      </div>
    </BaseForm>

    <template #footer="{ close }">
      <BaseDialogFooter
        :submitLabel="ruleId ? 'Save Rule' : 'Create Rule'"
        :loading="saving"
        :disabled="saving"
        @cancel="close"
        @submit="() => handleSave(close)"
      />
    </template>
  </BaseDialog>
</template>
