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
} from '@/utils/automationObjects'
import { required } from '@shared/components/form/validators.js'

const props = defineProps({ ruleId: { type: String, default: null } })
const emit = defineEmits(['saved'])
const open = defineModel({ type: Boolean, default: false })
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
    objectType: 'QualityEvent',
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

watch(open, (v) => {
  if (!v) return
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
  } else {
    draft.value = blankDraft()
  }
})

const fields = computed(() => fieldsForObject(draft.value.objectType))
const availableActions = computed(() => actionsForObject(draft.value.objectType))

// BaseSelect expects { id, name } items.
const objectItems = AUTOMATION_OBJECTS.map((o) => ({ id: o.value, name: o.label }))
const triggerItems = AUTOMATION_TRIGGERS.map((t) => ({ id: t.value, name: t.label }))

function addCondition() {
  const f = fields.value[0]
  draft.value.conditions.push({
    field: f?.key || '',
    operator: operatorsForField(draft.value.objectType, f?.key)[0]?.value || 'is',
    value: '',
  })
}
function removeCondition(i) {
  draft.value.conditions.splice(i, 1)
}
function operatorsFor(fieldKey) {
  return operatorsForField(draft.value.objectType, fieldKey)
}
function onFieldChange(cond) {
  cond.operator = operatorsFor(cond.field)[0]?.value || 'is'
  cond.value = ''
}

function addAction(type) {
  if (!type) return
  draft.value.actions.push({ type, config: {} })
}
function removeAction(i) {
  draft.value.actions.splice(i, 1)
}
const newActionType = ref('')

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
    return String(cond.value ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
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
          <BaseField label="Object">
            <BaseSelect
              v-model="draft.objectType"
              :options="objectItems"
              optionLabel="name"
              optionValue="id"
              :required="true"
            />
          </BaseField>
          <BaseField label="Trigger">
            <BaseSelect
              v-model="draft.trigger"
              :options="triggerItems"
              optionLabel="name"
              optionValue="id"
              :required="true"
            />
          </BaseField>
        </div>

        <!-- Conditions -->
        <div class="tw:border tw:border-divider tw:rounded-lg tw:p-3">
          <div class="tw:flex tw:items-center tw:justify-between tw:mb-2">
            <div class="tw:flex tw:items-center tw:gap-2">
              <span class="tw:text-xs tw:font-bold tw:uppercase tw:text-secondary">Conditions</span>
              <select
                v-model="draft.logic"
                class="tw:border tw:border-divider tw:rounded tw:px-2 tw:py-1 tw:text-xs"
              >
                <option value="AND">Match ALL (AND)</option>
                <option value="OR">Match ANY (OR)</option>
              </select>
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
            <select
              v-model="cond.field"
              class="tw:border tw:border-divider tw:rounded tw:px-2 tw:py-1.5 tw:text-sm tw:w-40"
              @change="onFieldChange(cond)"
            >
              <option v-for="f in fields" :key="f.key" :value="f.key">{{ f.label }}</option>
            </select>
            <select
              v-model="cond.operator"
              class="tw:border tw:border-divider tw:rounded tw:px-2 tw:py-1.5 tw:text-sm tw:w-40"
            >
              <option v-for="op in operatorsFor(cond.field)" :key="op.value" :value="op.value">
                {{ op.label }}
              </option>
            </select>
            <BaseTextInput
              v-if="!NO_VALUE_OPERATORS.has(cond.operator)"
              v-model="cond.value"
              size="sm"
              class="tw:flex-1"
              :placeholder="
                LIST_OPERATORS.has(cond.operator)
                  ? 'comma,separated,values'
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
            <span class="tw:text-xs tw:font-bold tw:uppercase tw:text-secondary">Actions</span>
            <div class="tw:flex tw:items-center tw:gap-2">
              <select
                v-model="newActionType"
                class="tw:border tw:border-divider tw:rounded tw:px-2 tw:py-1 tw:text-xs"
              >
                <option value="">Add action…</option>
                <option v-for="a in availableActions" :key="a.value" :value="a.value">
                  {{ a.label }}
                </option>
              </select>
              <BaseButton
                variant="outline"
                size="sm"
                :disabled="!newActionType"
                @click="
                  () => {
                    addAction(newActionType)
                    newActionType = ''
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
          <span class="tw:text-xs tw:font-bold tw:uppercase tw:text-secondary"
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
